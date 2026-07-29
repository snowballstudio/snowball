package com.snowball.health

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import androidx.core.content.ContextCompat
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume

/**
 * 最小验证 Worker：
 * 到19:30后只读取一次 TYPE_STEP_COUNTER 累计值并写入 SharedPreferences。
 * 不计算每日步数，不上传，不启动常驻服务。
 */
class StepCounterTestWorker(
    appContext: Context,
    params: WorkerParameters
) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result {
        val prefs = applicationContext.getSharedPreferences(
            PREFS_NAME,
            Context.MODE_PRIVATE
        )

        val capturedAt = System.currentTimeMillis()

        if (!hasActivityRecognitionPermission()) {
            prefs.edit()
                .putLong(KEY_CAPTURED_AT, capturedAt)
                .putString(KEY_STATUS, "缺少身体活动权限")
                .remove(KEY_CUMULATIVE_STEPS)
                .apply()
            return Result.success()
        }

        val cumulative = readCurrentCumulativeSteps()

        if (cumulative == null) {
            prefs.edit()
                .putLong(KEY_CAPTURED_AT, capturedAt)
                .putString(KEY_STATUS, "后台已运行，但没有读到计步传感器数值")
                .remove(KEY_CUMULATIVE_STEPS)
                .apply()
        } else {
            prefs.edit()
                .putLong(KEY_CAPTURED_AT, capturedAt)
                .putLong(KEY_CUMULATIVE_STEPS, cumulative)
                .putString(KEY_STATUS, "19:30后台读取成功")
                .apply()
        }

        return Result.success()
    }

    private fun hasActivityRecognitionPermission(): Boolean {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.Q ||
            ContextCompat.checkSelfPermission(
                applicationContext,
                Manifest.permission.ACTIVITY_RECOGNITION
            ) == PackageManager.PERMISSION_GRANTED
    }

    private suspend fun readCurrentCumulativeSteps(): Long? {
        val manager = applicationContext.getSystemService(
            Context.SENSOR_SERVICE
        ) as SensorManager
        val sensor = manager.getDefaultSensor(Sensor.TYPE_STEP_COUNTER)
            ?: return null

        return suspendCancellableCoroutine { continuation ->
            val handler = Handler(Looper.getMainLooper())
            var completed = false

            lateinit var listener: SensorEventListener

            val timeout = Runnable {
                if (!completed) {
                    completed = true
                    manager.unregisterListener(listener)
                    if (continuation.isActive) {
                        continuation.resume(null)
                    }
                }
            }

            listener = object : SensorEventListener {
                override fun onSensorChanged(event: SensorEvent?) {
                    if (completed) return
                    completed = true
                    handler.removeCallbacks(timeout)
                    manager.unregisterListener(this)

                    val value = event
                        ?.values
                        ?.firstOrNull()
                        ?.toLong()

                    if (continuation.isActive) {
                        continuation.resume(value)
                    }
                }

                override fun onAccuracyChanged(
                    sensor: Sensor?,
                    accuracy: Int
                ) = Unit
            }

            handler.post {
                val registered = manager.registerListener(
                    listener,
                    sensor,
                    SensorManager.SENSOR_DELAY_NORMAL
                )

                if (!registered && !completed) {
                    completed = true
                    if (continuation.isActive) {
                        continuation.resume(null)
                    }
                } else {
                    handler.postDelayed(timeout, 10_000L)
                }
            }

            continuation.invokeOnCancellation {
                handler.removeCallbacks(timeout)
                manager.unregisterListener(listener)
            }
        }
    }

    companion object {
        const val UNIQUE_WORK_NAME =
            "snowball-step-counter-test-1930"
        const val WORK_TAG =
            "snowball-step-counter-test"
        const val PREFS_NAME =
            "snowball_step_counter_test"
        const val KEY_SCHEDULED_FOR =
            "scheduled_for"
        const val KEY_CAPTURED_AT =
            "captured_at"
        const val KEY_CUMULATIVE_STEPS =
            "cumulative_steps"
        const val KEY_STATUS =
            "status"
    }
}
