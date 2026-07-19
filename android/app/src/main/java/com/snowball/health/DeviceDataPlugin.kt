package com.snowball.health

import android.Manifest
import android.app.AppOpsManager
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Process
import android.os.Handler
import android.os.Looper
import android.os.Build
import android.provider.Settings
import androidx.core.content.ContextCompat
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.time.TimeRangeFilter
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import com.getcapacitor.annotation.CapacitorPlugin
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.suspendCancellableCoroutine
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import kotlin.coroutines.resume
import kotlin.math.max

@CapacitorPlugin(
    name = "DeviceData",
    permissions = [
        Permission(
            strings = [Manifest.permission.ACTIVITY_RECOGNITION],
            alias = "activityRecognition"
        )
    ]
)
class DeviceDataPlugin : Plugin() {
    private val scope = CoroutineScope(Dispatchers.IO)
    private val stepsPermission = HealthPermission.getReadPermission(StepsRecord::class)

    @PluginMethod
    fun getStatus(call: PluginCall) {
        scope.launch {
            val result = JSObject()
            val sdkStatus = HealthConnectClient.getSdkStatus(context)
            result.put("healthAvailable", sdkStatus == HealthConnectClient.SDK_AVAILABLE)
            result.put("healthProviderUpdateRequired", sdkStatus == HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED)
            result.put("usageAccessGranted", hasUsageAccess())
            result.put("stepCounterAvailable", hasStepCounterSensor())
            result.put("activityRecognitionPermissionGranted", hasActivityRecognitionPermission())
            val manufacturer = Build.MANUFACTURER.orEmpty()
            val isHuawei = manufacturer.equals("HUAWEI", ignoreCase = true) || manufacturer.equals("HONOR", ignoreCase = true)
            result.put("deviceManufacturer", manufacturer)
            result.put("isHuaweiDevice", isHuawei)
            result.put(
                "stepProvider",
                when {
                    sdkStatus == HealthConnectClient.SDK_AVAILABLE -> "health-connect"
                    hasStepCounterSensor() -> "system-step-counter"
                    isHuawei -> "huawei-health-kit-required"
                    else -> "unavailable"
                }
            )
            var granted = false
            if (sdkStatus == HealthConnectClient.SDK_AVAILABLE) {
                try {
                    val client = HealthConnectClient.getOrCreate(context)
                    granted = client.permissionController.getGrantedPermissions().contains(stepsPermission)
                } catch (_: Exception) { }
            }
            result.put("healthPermissionGranted", granted)
            withContext(Dispatchers.Main) { call.resolve(result) }
        }
    }

    @PluginMethod
    fun requestActivityRecognitionPermission(call: PluginCall) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q || hasActivityRecognitionPermission()) {
            val out = JSObject()
            out.put("granted", true)
            call.resolve(out)
            return
        }
        requestPermissionForAlias("activityRecognition", call, "activityRecognitionPermissionResult")
    }

    @PermissionCallback
    private fun activityRecognitionPermissionResult(call: PluginCall) {
        val out = JSObject()
        out.put("granted", hasActivityRecognitionPermission())
        call.resolve(out)
    }

    @PluginMethod
    fun requestHealthPermissions(call: PluginCall) {
        if (HealthConnectClient.getSdkStatus(context) != HealthConnectClient.SDK_AVAILABLE) {
            call.reject("Health Connect is unavailable or requires an update")
            return
        }
        val intent = Intent(context, HealthPermissionActivity::class.java)
        startActivityForResult(call, intent, "healthPermissionResult")
    }

    @ActivityCallback
    private fun healthPermissionResult(call: PluginCall?, result: androidx.activity.result.ActivityResult) {
        if (call == null) return
        val out = JSObject()
        out.put("granted", result.resultCode == android.app.Activity.RESULT_OK)
        call.resolve(out)
    }

    @PluginMethod
    fun openUsageAccessSettings(call: PluginCall) {
        try {
            val intent = Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intent)
            call.resolve()
        } catch (error: Exception) {
            call.reject("Unable to open usage access settings", error)
        }
    }

    @PluginMethod
    fun readDailyData(call: PluginCall) {
        val days = max(1, minOf(31, call.getInt("days", 8) ?: 8))
        val cutoffHour = max(0, minOf(12, call.getInt("cutoffHour", 5) ?: 5))
        scope.launch {
            try {
                val zone = ZoneId.systemDefault()
                val formatter = DateTimeFormatter.ofPattern("yyyy/M/d")
                val requestedStartDate = call.getString("startDate")
                val startDate = try {
                    if (requestedStartDate.isNullOrBlank()) LocalDate.now(zone) else LocalDate.parse(requestedStartDate, formatter)
                } catch (_: Exception) {
                    LocalDate.now(zone)
                }
                val outputDays = JSArray()
                val healthClient = if (HealthConnectClient.getSdkStatus(context) == HealthConnectClient.SDK_AVAILABLE) {
                    HealthConnectClient.getOrCreate(context)
                } else null
                val canReadSteps = try {
                    healthClient?.permissionController?.getGrantedPermissions()?.contains(stepsPermission) == true
                } catch (_: Exception) { false }

                val today = LocalDate.now(zone)
                val cumulativeSteps = readCurrentCumulativeSteps()

                for (offset in 0 until days) {
                    val date = startDate.minusDays(offset.toLong())
                    val calendarStart = date.atStartOfDay(zone).toInstant()
                    val calendarEnd = date.plusDays(1).atStartOfDay(zone).toInstant()
                    val snowballStart = date.atTime(cutoffHour, 0).atZone(zone).toInstant()
                    val snowballEnd = date.plusDays(1).atTime(cutoffHour, 0).atZone(zone).toInstant()

                    var healthConnectSteps: Long? = null
                    if (canReadSteps && healthClient != null) {
                        try {
                            val aggregate = healthClient.aggregate(
                                AggregateRequest(
                                    metrics = setOf(StepsRecord.COUNT_TOTAL),
                                    timeRangeFilter = TimeRangeFilter.between(calendarStart, calendarEnd)
                                )
                            )
                            healthConnectSteps = aggregate[StepsRecord.COUNT_TOTAL] ?: 0L
                        } catch (_: Exception) {
                            healthConnectSteps = null
                        }
                    }

                    val usage = if (hasUsageAccess()) readUsageWindow(
                        usageStart = calendarStart,
                        usageEnd = calendarEnd,
                        offscreenStart = snowballStart,
                        offscreenEnd = snowballEnd,
                        ownerDate = date,
                        cutoffHour = cutoffHour,
                        zone = zone
                    ) else UsageDayResult(0, "", emptyList())

                    val day = JSObject()
                    day.put("date", date.format(formatter))
                    if (healthConnectSteps != null) {
                        day.put("healthConnectSteps", healthConnectSteps)
                        day.put("steps", healthConnectSteps)
                    }
                    if (date == today && cumulativeSteps != null) {
                        day.put("cumulativeSteps", cumulativeSteps)
                        day.put("stepCounter", cumulativeSteps)
                    }
                    day.put("screenMinutes", usage.screenMinutes)
                    day.put("offscreenTime", usage.offscreenTime)
                    val apps = JSArray()
                    usage.apps.forEach { app ->
                        val item = JSObject()
                        item.put("realAppName", app.realAppName)
                        item.put("packageName", app.packageName)
                        item.put("minutes", app.minutes)
                        item.put("pickups", app.pickups)
                        apps.put(item)
                    }
                    day.put("apps", apps)
                    outputDays.put(day)
                }

                val result = JSObject()
                result.put("days", outputDays)
                result.put("generatedAt", System.currentTimeMillis())
                withContext(Dispatchers.Main) { call.resolve(result) }
            } catch (error: Exception) {
                withContext(Dispatchers.Main) { call.reject("Failed to read device data", error) }
            }
        }
    }

    private fun hasStepCounterSensor(): Boolean {
        val manager = context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
        return manager.getDefaultSensor(Sensor.TYPE_STEP_COUNTER) != null
    }

    private fun hasActivityRecognitionPermission(): Boolean {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.Q ||
            ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.ACTIVITY_RECOGNITION
            ) == PackageManager.PERMISSION_GRANTED
    }

    private suspend fun readCurrentCumulativeSteps(): Long? {
        if (!hasStepCounterSensor() || !hasActivityRecognitionPermission()) return null

        return suspendCancellableCoroutine { continuation ->
            val manager = context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
            val sensor = manager.getDefaultSensor(Sensor.TYPE_STEP_COUNTER)

            if (sensor == null) {
                continuation.resume(null)
                return@suspendCancellableCoroutine
            }

            val handler = Handler(Looper.getMainLooper())
            var completed = false

            lateinit var listener: SensorEventListener
            val timeout = Runnable {
                if (!completed) {
                    completed = true
                    manager.unregisterListener(listener)
                    if (continuation.isActive) continuation.resume(null)
                }
            }

            listener = object : SensorEventListener {
                override fun onSensorChanged(event: SensorEvent?) {
                    if (completed) return
                    completed = true
                    handler.removeCallbacks(timeout)
                    manager.unregisterListener(this)
                    val value = event?.values?.firstOrNull()?.toLong()
                    if (continuation.isActive) continuation.resume(value)
                }

                override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit
            }

            handler.post {
                val registered = manager.registerListener(
                    listener,
                    sensor,
                    SensorManager.SENSOR_DELAY_NORMAL
                )
                if (!registered && !completed) {
                    completed = true
                    if (continuation.isActive) continuation.resume(null)
                } else {
                    handler.postDelayed(timeout, 2500L)
                }
            }

            continuation.invokeOnCancellation {
                handler.removeCallbacks(timeout)
                manager.unregisterListener(listener)
            }
        }
    }

    private fun hasUsageAccess(): Boolean {
        val appOps = context.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
        val mode = appOps.checkOpNoThrow(
            AppOpsManager.OPSTR_GET_USAGE_STATS,
            Process.myUid(),
            context.packageName
        )
        return mode == AppOpsManager.MODE_ALLOWED
    }

    private fun readUsageWindow(
        usageStart: Instant,
        usageEnd: Instant,
        offscreenStart: Instant,
        offscreenEnd: Instant,
        ownerDate: LocalDate,
        cutoffHour: Int,
        zone: ZoneId
    ): UsageDayResult {
        val manager = context.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager

        // APP 使用时长、屏幕总时长和打开次数按自然日统计：00:00 -> 次日 00:00。
        // 最后离机时间单独按雪球日统计：05:00 -> 次日 05:00。
        val usageStartMillis = usageStart.toEpochMilli()
        val usageEndMillis = minOf(usageEnd.toEpochMilli(), System.currentTimeMillis())
        val offscreenStartMillis = offscreenStart.toEpochMilli()
        val offscreenEndMillis = minOf(offscreenEnd.toEpochMilli(), System.currentTimeMillis())

        // 1) 使用时长：优先采用 Android 已经聚合好的前台时长。
        // 这条路线在华为 Android 10 上比自行配对 Activity 事件稳定得多，
        // 也是雪球最初测试中能得到约 6~7 小时合理总量的来源。
        val aggregateStats = try {
            manager.queryAndAggregateUsageStats(usageStartMillis, usageEndMillis)
        } catch (_: Exception) {
            emptyMap()
        }

        val durationMinutes = mutableMapOf<String, Int>()
        aggregateStats.forEach { (pkg, stats) ->
            if (pkg == context.packageName) return@forEach
            val millis = max(0L, stats.totalTimeInForeground)
            val minutes = (millis / 60000.0).toInt()
            if (minutes > 0) durationMinutes[pkg] = minutes
        }

        // 2) 打开次数：只把它当作“独立使用轮次”，不再把每个 Activity
        // 的 RESUMED 事件都算一次。优先按一次亮屏周期内每个 APP 最多一次；
        // 如果厂商没有提供完整亮屏事件，则退回 10 分钟会话合并规则。
        data class RawUsageEvent(val time: Long, val type: Int, val pkg: String)
        val rawEvents = mutableListOf<RawUsageEvent>()
        val usageEvents = manager.queryEvents(usageStartMillis, usageEndMillis)
        val event = UsageEvents.Event()

        while (usageEvents.hasNextEvent()) {
            usageEvents.getNextEvent(event)
            val pkg = event.packageName.orEmpty()
            val type = event.eventType
            val ts = event.timeStamp
            rawEvents.add(RawUsageEvent(ts, type, pkg))
        }

        // 最后离机时间使用独立的 05:00 -> 次日 05:00 查询窗口，
        // 避免影响 APP 使用时长和打开次数的自然日统计。
        var lastEffectiveUse = 0L
        val offscreenEvents = manager.queryEvents(offscreenStartMillis, offscreenEndMillis)
        val offscreenEvent = UsageEvents.Event()
        while (offscreenEvents.hasNextEvent()) {
            offscreenEvents.getNextEvent(offscreenEvent)
            when (offscreenEvent.eventType) {
                UsageEvents.Event.ACTIVITY_RESUMED,
                UsageEvents.Event.MOVE_TO_FOREGROUND,
                UsageEvents.Event.USER_INTERACTION,
                UsageEvents.Event.SCREEN_INTERACTIVE,
                UsageEvents.Event.SCREEN_NON_INTERACTIVE -> {
                    lastEffectiveUse = max(lastEffectiveUse, offscreenEvent.timeStamp)
                }
            }
        }

        val hasScreenEvents = rawEvents.any {
            it.type == UsageEvents.Event.SCREEN_INTERACTIVE ||
                it.type == UsageEvents.Event.SCREEN_NON_INTERACTIVE
        }
        val pickups = mutableMapOf<String, Int>()

        if (hasScreenEvents) {
            var screenCycle = 0
            var screenInteractive = false
            var seenInCycle = mutableSetOf<String>()

            rawEvents.forEach { e ->
                when (e.type) {
                    UsageEvents.Event.SCREEN_INTERACTIVE -> {
                        screenCycle += 1
                        screenInteractive = true
                        seenInCycle = mutableSetOf()
                    }
                    UsageEvents.Event.SCREEN_NON_INTERACTIVE -> {
                        screenInteractive = false
                        seenInCycle.clear()
                    }
                    UsageEvents.Event.ACTIVITY_RESUMED,
                    UsageEvents.Event.MOVE_TO_FOREGROUND -> {
                        val pkg = e.pkg
                        if (pkg.isBlank() || pkg == context.packageName) return@forEach
                        if (!durationMinutes.containsKey(pkg)) return@forEach
                        // 某些华为版本可能先给 APP 前台事件，再给亮屏事件。
                        // 这种情况下建立一个隐式亮屏周期，避免整天全部为 0。
                        if (!screenInteractive) {
                            screenCycle += 1
                            screenInteractive = true
                            seenInCycle = mutableSetOf()
                        }
                        if (seenInCycle.add(pkg)) {
                            pickups[pkg] = (pickups[pkg] ?: 0) + 1
                        }
                    }
                }
            }
        } else {
            val lastCountedAt = mutableMapOf<String, Long>()
            var previousForeground: String? = null
            val mergeWindowMillis = 10L * 60L * 1000L

            rawEvents.forEach { e ->
                if (e.type != UsageEvents.Event.ACTIVITY_RESUMED &&
                    e.type != UsageEvents.Event.MOVE_TO_FOREGROUND) return@forEach
                val pkg = e.pkg
                if (pkg.isBlank() || pkg == context.packageName) return@forEach
                if (!durationMinutes.containsKey(pkg)) return@forEach

                val last = lastCountedAt[pkg]
                val isNewRound = previousForeground != pkg &&
                    (last == null || e.time - last >= mergeWindowMillis)
                if (isNewRound) {
                    pickups[pkg] = (pickups[pkg] ?: 0) + 1
                    lastCountedAt[pkg] = e.time
                }
                previousForeground = pkg
            }
        }

        val rows = durationMinutes.entries
            .map { (pkg, minutes) ->
                AppUsageRow(
                    packageName = pkg,
                    realAppName = appLabel(pkg),
                    minutes = minutes,
                    pickups = pickups[pkg] ?: 0
                )
            }
            .sortedByDescending { it.minutes }

        val totalMinutes = durationMinutes.values.sum()
        val offscreen = if (lastEffectiveUse > 0L) {
            val local = Instant.ofEpochMilli(lastEffectiveUse).atZone(zone)
            var displayHour = local.hour
            if (local.toLocalDate().isAfter(ownerDate) && displayHour < cutoffHour) displayHour += 24
            String.format("%02d:%02d", displayHour, local.minute)
        } else "0"

        return UsageDayResult(totalMinutes, offscreen, rows)
    }

    private fun appLabel(packageName: String): String {
        return try {
            val info: ApplicationInfo = context.packageManager.getApplicationInfo(packageName, 0)
            context.packageManager.getApplicationLabel(info).toString().ifBlank { packageName }
        } catch (_: Exception) {
            packageName
        }
    }

    data class AppUsageRow(val packageName: String, val realAppName: String, val minutes: Int, val pickups: Int)
    data class UsageDayResult(val screenMinutes: Int, val offscreenTime: String, val apps: List<AppUsageRow>)
}
