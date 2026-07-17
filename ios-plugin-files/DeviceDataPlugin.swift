import Foundation
import Capacitor
import HealthKit

@objc(DeviceDataPlugin)
public class DeviceDataPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "DeviceDataPlugin"
    public let jsName = "DeviceData"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestHealthPermissions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openUsageAccessSettings", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "readDailyData", returnType: CAPPluginReturnPromise),
    ]

    private let healthStore = HKHealthStore()

    @objc func getStatus(_ call: CAPPluginCall) {
        call.resolve([
            "healthAvailable": HKHealthStore.isHealthDataAvailable(),
            "healthPermissionGranted": false,
            "usageAccessGranted": false,
        ])
    }

    @objc func requestHealthPermissions(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable(),
              let stepType = HKObjectType.quantityType(forIdentifier: .stepCount) else {
            call.reject("HealthKit is unavailable")
            return
        }
        healthStore.requestAuthorization(toShare: [], read: [stepType]) { success, error in
            DispatchQueue.main.async {
                if let error = error { call.reject("HealthKit authorization failed", nil, error) }
                else { call.resolve(["granted": success]) }
            }
        }
    }

    @objc func openUsageAccessSettings(_ call: CAPPluginCall) {
        // iOS does not expose Android-style UsageStats access.
        call.resolve()
    }

    @objc func readDailyData(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable(),
              let stepType = HKObjectType.quantityType(forIdentifier: .stepCount) else {
            call.resolve(["days": []])
            return
        }

        let dayCount = max(1, min(31, call.getInt("days") ?? 8))
        let calendar = Calendar.current
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy/M/d"
        let requestedStartDate = call.getString("startDate")
        let parsedStartDate = requestedStartDate.flatMap { formatter.date(from: $0) }
        let startDay = calendar.startOfDay(for: parsedStartDate ?? Date())
        let group = DispatchGroup()
        let lock = NSLock()
        var output = Array(repeating: [String: Any](), count: dayCount)

        for offset in 0..<dayCount {
            guard let start = calendar.date(byAdding: .day, value: -offset, to: startDay),
                  let end = calendar.date(byAdding: .day, value: 1, to: start) else { continue }
            let dateText = formatter.string(from: start)
            group.enter()
            let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: .strictStartDate)
            let query = HKStatisticsQuery(quantityType: stepType, quantitySamplePredicate: predicate, options: .cumulativeSum) { _, stats, _ in
                let steps = Int(stats?.sumQuantity()?.doubleValue(for: HKUnit.count()) ?? 0)
                let row: [String: Any] = [
                    "date": dateText,
                    "steps": steps,
                    "screenMinutes": 0,
                    "offscreenTime": "",
                    "apps": [],
                ]
                lock.lock(); output[offset] = row; lock.unlock()
                group.leave()
            }
            healthStore.execute(query)
        }

        group.notify(queue: .main) {
            call.resolve(["days": output, "generatedAt": Int(Date().timeIntervalSince1970 * 1000)])
        }
    }
}
