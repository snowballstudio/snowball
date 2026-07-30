package com.snowball.health

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.ContextCompat
import androidx.work.CoroutineWorker
import androidx.work.Data
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZonedDateTime
import java.util.concurrent.TimeUnit

/**
 * 每日23:50由WorkManager唤醒，并启动最长两分钟的临时前台服务读取TYPE_STEP_COUNTER。
 * Worker每次执行时都会预先安排下一天任务，因此用户不必每天打开雪球。
 */
class StepCounterTestWorker(
    appContext: Context,
    params: WorkerParameters
) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result {
        val scheduledFor = inputData.getLong(INPUT_SCHEDULED_FOR, 0L)
            .takeIf { it > 0L }
            ?: System.currentTimeMillis()
        val dateKey = dateKeyForScheduledTime(scheduledFor)
        val prefs = applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val workerStartedAt = System.currentTimeMillis()

        // 先安排下一天。即使本次传感器读取失败，后续日期仍会继续自动尝试。
        scheduleForDate(
            applicationContext,
            Instant.ofEpochMilli(scheduledFor)
                .atZone(ZoneId.systemDefault())
                .toLocalDate()
                .plusDays(1)
        )

        prefs.edit()
            .putLong(dayKey(KEY_SCHEDULED_FOR_PREFIX, dateKey), scheduledFor)
            .putLong(dayKey(KEY_CAPTURED_AT_PREFIX, dateKey), workerStartedAt)
            .putLong(dayKey(KEY_SERVICE_STARTED_AT_PREFIX, dateKey), workerStartedAt)
            .putString(dayKey(KEY_STATUS_PREFIX, dateKey), "23:50后台任务已启动，正在启动临时前台服务")
            .remove(dayKey(KEY_CUMULATIVE_STEPS_PREFIX, dateKey))
            // 兼容当前诊断页面读取最新一次状态
            .putLong(KEY_SCHEDULED_FOR, scheduledFor)
            .putLong(KEY_CAPTURED_AT, workerStartedAt)
            .putString(KEY_STATUS, "23:50后台任务已启动，正在启动临时前台服务")
            .remove(KEY_CUMULATIVE_STEPS)
            .apply()

        if (!hasActivityRecognitionPermission()) {
            saveFailure(dateKey, "缺少身体活动权限，前台服务未启动")
            return Result.success()
        }

        return try {
            val intent = Intent(applicationContext, StepCounterForegroundService::class.java)
                .putExtra(StepCounterForegroundService.EXTRA_SCHEDULED_FOR, scheduledFor)
            ContextCompat.startForegroundService(applicationContext, intent)
            Result.success()
        } catch (error: Exception) {
            saveFailure(dateKey, "后台任务已运行，但启动前台服务失败：${error.javaClass.simpleName}")
            Result.success()
        }
    }

    private fun saveFailure(dateKey: String, message: String) {
        val now = System.currentTimeMillis()
        applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putLong(dayKey(KEY_CAPTURED_AT_PREFIX, dateKey), now)
            .putString(dayKey(KEY_STATUS_PREFIX, dateKey), message)
            .remove(dayKey(KEY_CUMULATIVE_STEPS_PREFIX, dateKey))
            .putLong(KEY_CAPTURED_AT, now)
            .putString(KEY_STATUS, message)
            .remove(KEY_CUMULATIVE_STEPS)
            .apply()
    }

    private fun hasActivityRecognitionPermission(): Boolean {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.Q ||
            ContextCompat.checkSelfPermission(
                applicationContext,
                Manifest.permission.ACTIVITY_RECOGNITION
            ) == PackageManager.PERMISSION_GRANTED
    }

    companion object {
        const val WORK_TAG = "snowball-step-counter-nightly"
        const val PREFS_NAME = "snowball_step_counter_test"
        const val INPUT_SCHEDULED_FOR = "scheduled_for_input"

        // 最新一次兼容字段
        const val KEY_SCHEDULED_FOR = "scheduled_for"
        const val KEY_CAPTURED_AT = "captured_at"
        const val KEY_SERVICE_STARTED_AT = "service_started_at"
        const val KEY_CUMULATIVE_STEPS = "cumulative_steps"
        const val KEY_STATUS = "status"

        // 按逻辑日期保存，避免连续多日后台结果互相覆盖。
        const val KEY_SCHEDULED_FOR_PREFIX = "scheduled_for_"
        const val KEY_CAPTURED_AT_PREFIX = "captured_at_"
        const val KEY_SERVICE_STARTED_AT_PREFIX = "service_started_at_"
        const val KEY_CUMULATIVE_STEPS_PREFIX = "cumulative_steps_"
        const val KEY_STATUS_PREFIX = "status_"

        private const val CAPTURE_HOUR = 23
        private const val CAPTURE_MINUTE = 50
        private const val UNIQUE_WORK_PREFIX = "snowball-step-counter-nightly-"

        fun dayKey(prefix: String, dateKey: String): String = "$prefix$dateKey"

        fun dateKeyForScheduledTime(value: Long): String =
            Instant.ofEpochMilli(value)
                .atZone(ZoneId.systemDefault())
                .toLocalDate()
                .toString()

        /** 安排今天尚未到达的23:50；若已过23:50，则安排明天。 */
        fun scheduleNext(context: Context) {
            val zone = ZoneId.systemDefault()
            val now = ZonedDateTime.now(zone)
            var targetDate = now.toLocalDate()
            val todayTarget = targetDate.atTime(CAPTURE_HOUR, CAPTURE_MINUTE).atZone(zone)
            if (!todayTarget.isAfter(now)) targetDate = targetDate.plusDays(1)
            scheduleForDate(context, targetDate)
        }

        fun scheduleForDate(context: Context, date: LocalDate) {
            val zone = ZoneId.systemDefault()
            val target = date.atTime(CAPTURE_HOUR, CAPTURE_MINUTE).atZone(zone)
            val now = ZonedDateTime.now(zone)
            val delayMillis = Duration.between(now, target).toMillis().coerceAtLeast(0L)
            val scheduledFor = target.toInstant().toEpochMilli()
            val dateKey = date.toString()

            val input = Data.Builder()
                .putLong(INPUT_SCHEDULED_FOR, scheduledFor)
                .build()
            val request = OneTimeWorkRequestBuilder<StepCounterTestWorker>()
                .setInitialDelay(delayMillis, TimeUnit.MILLISECONDS)
                .setInputData(input)
                .addTag(WORK_TAG)
                .build()

            WorkManager.getInstance(context).enqueueUniqueWork(
                "$UNIQUE_WORK_PREFIX$dateKey",
                ExistingWorkPolicy.KEEP,
                request
            )

            context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .edit()
                .putLong(KEY_SCHEDULED_FOR, scheduledFor)
                .putLong(dayKey(KEY_SCHEDULED_FOR_PREFIX, dateKey), scheduledFor)
                .apply()
        }
    }
}
