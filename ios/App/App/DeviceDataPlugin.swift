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
        CAPPluginMethod(name: "readDailyData", returnType: CAPPluginReturnPromise)
    ]

    private let healthStore = HKHealthStore()
    private let permissionRequestedKey = "snowball.healthkit.steps.permission.requested"

    private var stepType: HKQuantityType? {
        HKObjectType.quantityType(forIdentifier: .stepCount)
    }

    @objc public func getStatus(_ call: CAPPluginCall) {
        let available = HKHealthStore.isHealthDataAvailable() && stepType != nil
        let permissionRequested = UserDefaults.standard.bool(forKey: permissionRequestedKey)

        call.resolve([
            "healthAvailable": available,
            "healthProviderUpdateRequired": false,
            "healthPermissionGranted": permissionRequested,
            "usageAccessGranted": false,
            "deviceManufacturer": "Apple",
            "isHuaweiDevice": false,
            "stepProvider": available ? "apple-health-kit" : "unavailable"
        ])
    }

    @objc public func requestHealthPermissions(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable(),
              let stepType = stepType else {
            call.reject("HealthKit is unavailable on this device")
            return
        }

        healthStore.requestAuthorization(toShare: [], read: [stepType]) { [weak self] success, error in
            DispatchQueue.main.async {
                if let error = error {
                    call.reject("HealthKit authorization failed", nil, error)
                    return
                }

                if success {
                    UserDefaults.standard.set(
                        true,
                        forKey: self?.permissionRequestedKey
                            ?? "snowball.healthkit.steps.permission.requested"
                    )
                }

                call.resolve([
                    "granted": success
                ])
            }
        }
    }

    @objc public func readDailyData(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable(),
              let stepType = stepType else {
            call.reject("HealthKit is unavailable on this device")
            return
        }

        let requestedDays = call.getInt("days") ?? 8
        let days = max(1, min(31, requestedDays))
        let startDateText = call.getString("startDate")

        let calendar = Calendar.autoupdatingCurrent
        let startDate = parseSnowballDate(startDateText, calendar: calendar)
            ?? calendar.startOfDay(for: Date())

        Task {
            do {
                var outputDays: [[String: Any]] = []
                outputDays.reserveCapacity(days)

                for offset in 0..<days {
                    guard let date = calendar.date(
                        byAdding: .day,
                        value: -offset,
                        to: startDate
                    ),
                    let endDate = calendar.date(
                        byAdding: .day,
                        value: 1,
                        to: date
                    ) else {
                        continue
                    }

                    let steps = try await readSteps(
                        stepType: stepType,
                        startDate: date,
                        endDate: endDate
                    )

                    outputDays.append([
                        "date": formatSnowballDate(date, calendar: calendar),
                        "appleHealthKitSteps": steps,
                        "steps": steps,
                        "apps": []
                    ])
                }

                await MainActor.run {
                    call.resolve([
                        "days": outputDays,
                        "generatedAt": Int(Date().timeIntervalSince1970 * 1000)
                    ])
                }
            } catch {
                let nsError = error as NSError

                print("""
                SNOWBALL HEALTHKIT ERROR
                domain: \(nsError.domain)
                code: \(nsError.code)
                description: \(nsError.localizedDescription)
                userInfo: \(nsError.userInfo)
                """)

                await MainActor.run {
                    call.reject(
                        "HealthKit error \(nsError.domain) \(nsError.code): \(nsError.localizedDescription)",
                        nil,
                        error
                    )
                }
            }
        }
    }

    private func readSteps(
        stepType: HKQuantityType,
        startDate: Date,
        endDate: Date
    ) async throws -> Int {
        try await withCheckedThrowingContinuation { continuation in
            let predicate = HKQuery.predicateForSamples(
                withStart: startDate,
                end: endDate,
                options: [.strictStartDate, .strictEndDate]
            )

            let query = HKStatisticsQuery(
                quantityType: stepType,
                quantitySamplePredicate: predicate,
                options: .cumulativeSum
            ) { _, result, error in
                if let error = error {
                    continuation.resume(throwing: error)
                    return
                }

                let total = result?
                    .sumQuantity()?
                    .doubleValue(for: HKUnit.count()) ?? 0

                continuation.resume(
                    returning: max(0, Int(total.rounded()))
                )
            }

            healthStore.execute(query)
        }
    }

    private func parseSnowballDate(
        _ value: String?,
        calendar: Calendar
    ) -> Date? {
        guard let value = value?
            .trimmingCharacters(in: .whitespacesAndNewlines),
            !value.isEmpty else {
            return nil
        }

        let formatter = DateFormatter()
        formatter.calendar = calendar
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = calendar.timeZone
        formatter.dateFormat = "yyyy/M/d"

        guard let parsed = formatter.date(from: value) else {
            return nil
        }

        return calendar.startOfDay(for: parsed)
    }

    private func formatSnowballDate(
        _ date: Date,
        calendar: Calendar
    ) -> String {
        let parts = calendar.dateComponents(
            [.year, .month, .day],
            from: date
        )

        return "\(parts.year ?? 0)/\(parts.month ?? 0)/\(parts.day ?? 0)"
    }
}
