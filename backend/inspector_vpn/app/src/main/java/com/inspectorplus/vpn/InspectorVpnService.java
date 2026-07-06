package com.inspectorplus.vpn;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Intent;
import android.net.VpnService;
import android.os.Binder;
import android.os.Build;
import android.os.IBinder;
import android.os.ParcelFileDescriptor;
import android.util.Log;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.UnknownHostException;
import java.io.InputStream;
import java.io.OutputStream;

public class InspectorVpnService extends VpnService {
    private static final String TAG = "InspectorVPN";
    private static final String CHANNEL_ID = "vpn_channel";
    private static final int NOTIFICATION_ID = 1;
    private static final int DEVICE_PROXY_PORT = 8081;
    private static final int[] PROXY_PORTS = {8081, 8082, 8083, 8084};

    private volatile boolean running = false;
    private volatile boolean proxyReady = false;
    private ServerSocket serverSocket = null;
    private Thread proxyThread = null;

    public static String mitmHost = "127.0.0.1";
    public static int mitmPort = 8080;

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && "stop".equals(intent.getAction())) {
            stopVpn();
            return START_NOT_STICKY;
        }
        if (intent != null) {
            String portStr = intent.getStringExtra("mitm_port");
            if (portStr != null) {
                try { mitmPort = Integer.parseInt(portStr); } catch (Exception e) {}
            }
        }
        boolean started = startVpn();
        if (!started) {
            Log.e(TAG, "startVpn failed — stopping service");
            stopVpn();
            return START_NOT_STICKY;
        }
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        stopVpn();
        super.onDestroy();
    }

    @Override
    public void onRevoke() {
        stopVpn();
        super.onRevoke();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "InspectorPlus VPN",
                NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Network traffic interception active");
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) nm.createNotificationChannel(channel);
        }
    }

    private void startForegroundNotification() {
        android.app.Notification notification = new android.app.Notification.Builder(this, CHANNEL_ID)
            .setContentTitle("InspectorPlus VPN")
            .setContentText("Full network interception active")
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .build();
        startForeground(NOTIFICATION_ID, notification);
    }

    private boolean startVpn() {
        if (running) return true;

        try {
            startForegroundNotification();

            // Build VPN interface using the VpnService's builder
            Builder builder = new Builder();
            builder.setSession("InspectorPlus");
            builder.addAddress("10.0.0.2", 32);
            builder.addRoute("0.0.0.0", 0);
            builder.addDnsServer("8.8.8.8");
            builder.addDnsServer("1.1.1.1");
            builder.setMtu(1500);
            builder.setBlocking(true);

            ParcelFileDescriptor pfd = builder.establish();
            if (pfd == null) {
                Log.e(TAG, "VPN interface establish returned null");
                return false;
            }
            running = true;
            Log.i(TAG, "VPN interface established");

            // Start local TCP proxy that forwards to mitmdump
            boolean proxyStarted = startLocalProxy();
            if (!proxyStarted) {
                Log.e(TAG, "Local proxy failed to start — aborting VPN");
                cleanupVpn();
                return false;
            }

            Log.i(TAG, "VPN started: " + mitmHost + ":" + mitmPort);
            return true;

        } catch (Exception e) {
            Log.e(TAG, "Failed to start VPN", e);
            cleanupVpn();
            return false;
        }
    }

    private boolean startLocalProxy() {
        int boundPort = -1;
        serverSocket = null;

        // Try each port in order — find first one that binds successfully
        for (int port : PROXY_PORTS) {
            try {
                serverSocket = new ServerSocket(port);
                serverSocket.setReuseAddress(true);
                boundPort = port;
                Log.i(TAG, "Local proxy listening on port " + boundPort);
                break;
            } catch (IOException e) {
                Log.w(TAG, "Port " + port + " in use, trying next: " + e.getMessage());
                serverSocket = null;
            }
        }

        if (serverSocket == null || boundPort == -1) {
            Log.e(TAG, "All proxy ports " + java.util.Arrays.toString(PROXY_PORTS) + " failed to bind");
            return false;
        }

        proxyThread = new Thread(() -> {
            while (running && serverSocket != null && !serverSocket.isClosed()) {
                try {
                    Socket client = serverSocket.accept();
                    new Thread(() -> handleProxyConnection(client)).start();
                } catch (IOException e) {
                    if (running) Log.e(TAG, "Proxy accept error", e);
                    break;
                }
            }
        });
        proxyThread.start();
        proxyReady = true;
        return true;
    }

    private boolean isPortInUse(int port) {
        try (ServerSocket test = new ServerSocket(port)) {
            test.setReuseAddress(true);
            return false;
        } catch (IOException e) {
            return true;
        } catch (Exception e) {
            return true;
        }
    }

    private void cleanupVpn() {
        running = false;
        if (proxyThread != null) {
            proxyThread.interrupt();
            proxyThread = null;
        }
        try {
            if (serverSocket != null) serverSocket.close();
        } catch (Exception e) { }
        serverSocket = null;
    }

    private void handleProxyConnection(Socket clientSocket) {
        Socket mitmSocket = null;
        try {
            // Connect to mitmdump on host (via adb reverse tunnel or direct)
            mitmSocket = new Socket(mitmHost, mitmPort);

            // CRITICAL: protect socket from VPN tunnel to prevent loops
            protect(mitmSocket);

            InputStream clientIn = clientSocket.getInputStream();
            OutputStream clientOut = clientSocket.getOutputStream();
            InputStream mitmIn = mitmSocket.getInputStream();
            OutputStream mitmOut = mitmSocket.getOutputStream();

            byte[] buffer = new byte[32767];

            // Forward client -> mitmdump
            Thread clientToMitm = new Thread(() -> {
                try {
                    while (running) {
                        int available = clientIn.available();
                        if (available > 0) {
                            int read = clientIn.read(buffer, 0, Math.min(available, buffer.length));
                            if (read > 0) {
                                mitmOut.write(buffer, 0, read);
                                mitmOut.flush();
                            }
                        }
                        Thread.sleep(1);
                    }
                } catch (Exception e) { }
            });
            clientToMitm.start();

            // Forward mitmdump -> client
            Thread mitmToClient = new Thread(() -> {
                try {
                    while (running) {
                        int available = mitmIn.available();
                        if (available > 0) {
                            int read = mitmIn.read(buffer);
                            if (read > 0) {
                                clientOut.write(buffer, 0, read);
                                clientOut.flush();
                            }
                        }
                        Thread.sleep(1);
                    }
                } catch (Exception e) { }
            });
            mitmToClient.start();

            // Wait for threads to finish
            clientToMitm.join();
            mitmToClient.join();

        } catch (Exception e) {
            Log.e(TAG, "Proxy connection error", e);
        } finally {
            try { clientSocket.close(); } catch (Exception e) { }
            try { if (mitmSocket != null) mitmSocket.close(); } catch (Exception e) { }
        }
    }

    private void stopVpn() {
        running = false;
        proxyReady = false;

        if (proxyThread != null) {
            proxyThread.interrupt();
            proxyThread = null;
        }

        try {
            if (serverSocket != null) serverSocket.close();
        } catch (Exception e) { }
        serverSocket = null;

        stopForeground(STOP_FOREGROUND_REMOVE);
        stopSelf();

        Log.i(TAG, "VPN stopped");
    }
}