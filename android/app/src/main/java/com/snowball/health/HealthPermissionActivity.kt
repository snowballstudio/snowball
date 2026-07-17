package com.snowball.health

import android.app.Activity
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.StepsRecord

class HealthPermissionActivity : ComponentActivity() {
    private val permissions = setOf(HealthPermission.getReadPermission(StepsRecord::class))
    private val launcher = registerForActivityResult(PermissionController.createRequestPermissionResultContract()) { granted ->
        setResult(if (granted.containsAll(permissions)) Activity.RESULT_OK else Activity.RESULT_CANCELED)
        finish()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (HealthConnectClient.getSdkStatus(this) == HealthConnectClient.SDK_AVAILABLE) launcher.launch(permissions)
        else {
            setResult(Activity.RESULT_CANCELED)
            finish()
        }
    }
}
