package com.snowball.health

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import androidx.core.app.NotificationCompat

/**
 * 每晚短暂启动，读取到第一条TYPE_STEP_COUNTER累计值即保存并退出；最长等待两分钟。
 */
class StepCounterForegroundService : Service(), SensorEventListener {

    private lateinit var sensorManager: SensorManager
    private val handler = Handler(Looper.getMainLooper())
    private var finished = false
    private var scheduledFor = 0L
    private var dateKey = ""

    private val timeoutRunnable = Runnable {
        finishWithFailure("临时前台服务已运行2分钟，但没有收到计步传感器数值")
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        startAsForeground()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (finished) return START_NOT_STICKY
        scheduledFor = intent?.getLongExtra(EXTRA_SCHEDULED_FOR, 0L)
            ?.takeIf { it > 0L }
            ?: System.currentTimeMillis()
        dateKey = StepCounterTestWorker.dateKeyForScheduledTime(scheduledFor)
        startReading()
        return START_NOT_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun startAsForeground() {
        val notification: Notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(applicationInfo.icon)
            .setContentTitle("雪球正在读取步数")
            .setContentText("每日短暂读取系统累计步数，完成后自动停止")
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .build()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_HEALTH)
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    private fun startReading() {
        val prefs = getSharedPreferences(StepCounterTestWorker.PREFS_NAME, Context.MODE_PRIVATE)
        val startedAt = System.currentTimeMillis()
        prefs.edit()
            .putLong(StepCounterTestWorker.dayKey(StepCounterTestWorker.KEY_SERVICE_STARTED_AT_PREFIX, dateKey), startedAt)
            .putLong(StepCounterTestWorker.dayKey(StepCounterTestWorker.KEY_CAPTURED_AT_PREFIX, dateKey), startedAt)
            .putString(StepCounterTestWorker.dayKey(StepCounterTestWorker.KEY_STATUS_PREFIX, dateKey), "临时前台服务已启动，正在等待计步传感器")
            .remove(StepCounterTestWorker.dayKey(StepCounterTestWorker.KEY_CUMULATIVE_STEPS_PREFIX, dateKey))
            .putLong(StepCounterTestWorker.KEY_CAPTURED_AT, startedAt)
            .putString(StepCounterTestWorker.KEY_STATUS, "临时前台服务已启动，正在等待计步传感器")
            .remove(StepCounterTestWorker.KEY_CUMULATIVE_STEPS)
            .apply()

        sensorManager = getSystemService(Context.SENSOR_SERVICE) as SensorManager
        val sensor = sensorManager.getDefaultSensor(Sensor.TYPE_STEP_COUNTER)
        if (sensor == null) {
            finishWithFailure("手机没有TYPE_STEP_COUNTER计步传感器")
            return
        }

        val registered = sensorManager.registerListener(this, sensor, SensorManager.SENSOR_DELAY_NORMAL)
        if (!registered) {
            finishWithFailure("临时前台服务启动成功，但计步传感器注册失败")
            return
        }
        handler.postDelayed(timeoutRunnable, TIMEOUT_MILLIS)
    }

    override fun onSensorChanged(event: SensorEvent?) {
        if (finished || event?.sensor?.type != Sensor.TYPE_STEP_COUNTER) return
        val value = event.values.firstOrNull()?.toLong()
        if (value == null) {
            finishWithFailure("收到计步事件，但数值为空")
            return
        }

        finished = true
        handler.removeCallbacks(timeoutRunnable)
        sensorManager.unregisterListener(this)
        val finishedAt = System.currentTimeMillis()
        val status = "23:50临时前台服务读取成功"
        getSharedPreferences(StepCounterTestWorker.PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putLong(StepCounterTestWorker.dayKey(StepCounterTestWorker.KEY_CAPTURED_AT_PREFIX, dateKey), finishedAt)
            .putLong(StepCounterTestWorker.dayKey(StepCounterTestWorker.KEY_CUMULATIVE_STEPS_PREFIX, dateKey), value)
            .putString(StepCounterTestWorker.dayKey(StepCounterTestWorker.KEY_STATUS_PREFIX, dateKey), status)
            .putLong(StepCounterTestWorker.KEY_CAPTURED_AT, finishedAt)
            .putLong(StepCounterTestWorker.KEY_CUMULATIVE_STEPS, value)
            .putString(StepCounterTestWorker.KEY_STATUS, status)
            .apply()
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit

    private fun finishWithFailure(message: String) {
        if (finished) return
        finished = true
        handler.removeCallbacks(timeoutRunnable)
        if (::sensorManager.isInitialized) sensorManager.unregisterListener(this)
        val now = System.currentTimeMillis()
        getSharedPreferences(StepCounterTestWorker.PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putLong(StepCounterTestWorker.dayKey(StepCounterTestWorker.KEY_CAPTURED_AT_PREFIX, dateKey), now)
            .putString(StepCounterTestWorker.dayKey(StepCounterTestWorker.KEY_STATUS_PREFIX, dateKey), message)
            .remove(StepCounterTestWorker.dayKey(StepCounterTestWorker.KEY_CUMULATIVE_STEPS_PREFIX, dateKey))
            .putLong(StepCounterTestWorker.KEY_CAPTURED_AT, now)
            .putString(StepCounterTestWorker.KEY_STATUS, message)
            .remove(StepCounterTestWorker.KEY_CUMULATIVE_STEPS)
            .apply()
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    override fun onDestroy() {
        handler.removeCallbacks(timeoutRunnable)
        if (::sensorManager.isInitialized) sensorManager.unregisterListener(this)
        super.onDestroy()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = getSystemService(NotificationManager::class.java)
        val channel = NotificationChannel(
            CHANNEL_ID,
            "步数每日自动读取",
            NotificationManager.IMPORTANCE_LOW
        ).apply {
            description = "雪球每天接近午夜短暂读取系统累计步数时显示"
            setShowBadge(false)
        }
        manager.createNotificationChannel(channel)
    }

    companion object {
        const val EXTRA_SCHEDULED_FOR = "scheduled_for"
        private const val CHANNEL_ID = "snowball_step_counter_daily"
        private const val NOTIFICATION_ID = 2350
        private const val TIMEOUT_MILLIS = 120_000L
    }
}
