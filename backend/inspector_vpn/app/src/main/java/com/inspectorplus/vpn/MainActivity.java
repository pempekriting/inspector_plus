package com.inspectorplus.vpn;

import android.app.Activity;
import android.content.Intent;
import android.net.VpnService;
import android.os.Bundle;
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

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Check for AUTO_START action (launched from backend)
        Intent intent = getIntent();
        if (intent != null && "com.inspectorplus.vpn.AUTO_START".equals(intent.getAction())) {
            mitmPort = intent.getStringExtra("mitm_port");
            if (mitmPort == null) mitmPort = "8080";
            // Auto-start VPN silently, then close activity
            attemptStartVpn();
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
            }
        }
    }

    private void startVpnService() {
        Intent svcIntent = new Intent(this, InspectorVpnService.class);
        svcIntent.putExtra("mitm_port", mitmPort);
        startService(svcIntent);
        // If we have UI, update it; otherwise just finish
        if (statusText != null) {
            statusText.setText("VPN Active\nAll traffic being intercepted");
            toggleButton.setText("Stop VPN");
            toggleButton.setOnClickListener(v -> stopVpnService());
        } else {
            finish();
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
}
