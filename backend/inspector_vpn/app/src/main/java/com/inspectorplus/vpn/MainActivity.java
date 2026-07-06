package com.inspectorplus.vpn;

import android.app.Activity;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.ServiceConnection;
import android.net.VpnService;
import android.os.Bundle;
import android.os.IBinder;
import android.util.Log;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

public class MainActivity extends Activity {
    private static final int REQUEST_VPN_PERMISSION = 100;
    private TextView statusText;
    private Button toggleButton;
    private String mitmPort = "8080";
    private boolean serviceBound = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Check for AUTO_START action (launched from backend)
        Intent intent = getIntent();
        if (intent != null && "com.inspectorplus.vpn.AUTO_START".equals(intent.getAction())) {
            mitmPort = intent.getStringExtra("mitm_port");
            if (mitmPort == null) mitmPort = "8080";
            // Auto-start VPN silently, wait for service to confirm
            attemptStartVpnAuto();
            return;
        }
        if (intent != null && "com.inspectorplus.vpn.STOP".equals(intent.getAction())) {
            stopVpnService();
            finish();
            return;
        }

        // Normal manual launch — show UI
        buildUI();
    }

    private void buildUI() {
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setPadding(48, 48, 48, 48);

        statusText = new TextView(this);
        statusText.setText("InspectorPlus VPN\nTap to start interception");
        statusText.setTextSize(16);

        toggleButton = new Button(this);
        toggleButton.setText("Start VPN");
        toggleButton.setOnClickListener(v -> attemptStartVpn());

        layout.addView(statusText);
        layout.addView(toggleButton);
        setContentView(layout);
    }

    private void attemptStartVpn() {
        Intent prepareIntent = VpnService.prepare(this);
        if (prepareIntent != null) {
            startActivityForResult(prepareIntent, REQUEST_VPN_PERMISSION);
        } else {
            startVpnService();
        }
    }

    private void attemptStartVpnAuto() {
        Intent prepareIntent = VpnService.prepare(this);
        if (prepareIntent != null) {
            // Need user permission — launch permission activity
            // Use a temporary activity result callback to retry auto-start after permission
            startActivityForResult(prepareIntent, REQUEST_VPN_PERMISSION);
        } else {
            // No permission needed — start service immediately
            startVpnService();
            // Don't finish immediately — wait for service to be bound/ready
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQUEST_VPN_PERMISSION) {
            if (resultCode == RESULT_OK) {
                startVpnService();
                if (statusText != null) {
                    statusText.setText("VPN Active\nAll traffic being intercepted");
                    toggleButton.setText("Stop VPN");
                    toggleButton.setOnClickListener(v -> stopVpnService());
                }
            } else {
                Toast.makeText(this, "VPN permission denied", Toast.LENGTH_SHORT).show();
                // For auto-start mode, close now
                if (getIntent() != null && "com.inspectorplus.vpn.AUTO_START".equals(getIntent().getAction())) {
                    finish();
                }
            }
        }
    }

    private ServiceConnection vpnServiceConnection = new ServiceConnection() {
        @Override
        public void onServiceConnected(ComponentName name, IBinder service) {
            serviceBound = true;
            // Service is connected and running — safe to finish now
            Log.i("InspectorVPN", "Service bound successfully, finishing auto-start");
            finish();
        }

        @Override
        public void onServiceDisconnected(ComponentName name) {
            serviceBound = false;
        }
    };

    private void startVpnService() {
        Intent svcIntent = new Intent(this, InspectorVpnService.class);
        svcIntent.putExtra("mitm_port", mitmPort);
        startService(svcIntent);

        // For auto-start mode, bind to service to get confirmation it started
        Intent intent = getIntent();
        boolean isAutoStart = intent != null && "com.inspectorplus.vpn.AUTO_START".equals(intent.getAction());

        if (isAutoStart) {
            // Bind to service to wait for confirmation
            bindService(svcIntent, vpnServiceConnection, Context.BIND_AUTO_CREATE);
            // Set a timeout to finish even if binding fails
            new android.os.Handler(android.os.Looper.getMainLooper()).postDelayed(() -> {
                if (!serviceBound) {
                    Log.w("InspectorVPN", "Service bind timeout, finishing anyway");
                    finish();
                }
            }, 5000);
        } else {
            // Manual mode — update UI
            if (statusText != null) {
                statusText.setText("VPN Active\nAll traffic being intercepted");
                toggleButton.setText("Stop VPN");
                toggleButton.setOnClickListener(v -> stopVpnService());
            }
        }
    }

    private void stopVpnService() {
        Intent intent = new Intent(this, InspectorVpnService.class);
        intent.setAction("stop");
        startService(intent);
        if (statusText != null) {
            statusText.setText("VPN Stopped");
            toggleButton.setText("Start VPN");
            toggleButton.setOnClickListener(v -> attemptStartVpn());
        }
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (serviceBound) {
            unbindService(vpnServiceConnection);
            serviceBound = false;
        }
    }
}