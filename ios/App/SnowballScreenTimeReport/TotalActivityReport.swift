import DeviceActivity
import ExtensionKit
import Foundation
import ManagedSettings
import SwiftUI

extension DeviceActivityReport.Context {
    static let totalActivity = Self("Total Activity")
}

struct ScreenTimeApplicationRow: Identifiable, Hashable, Sendable {
    let id: String
    let displayName: String
    let bundleIdentifier: String
    let duration: TimeInterval
    let pickups: Int
    let notifications: Int
}

struct ScreenTimeCategoryRow: Identifiable, Hashable, Sendable {
    let id: String
    let name: String
    let duration: TimeInterval
    let applications: [ScreenTimeApplicationRow]
}

struct ScreenTimeSegmentRow: Identifiable, Hashable, Sendable {
    let id: String
    let start: Date
    let end: Date
    let duration: TimeInterval
    let firstPickup: Date?
    let longestStart: Date?
    let longestEnd: Date?
    let pickupsWithoutApplication: Int
}

struct ScreenTimeDeviceRow: Identifiable, Hashable, Sendable {
    let id: String
    let name: String
    let model: String
    let lastUpdatedDate: Date
}

struct TotalActivityConfiguration: Sendable {
    let totalDuration: TimeInterval
    let categories: [ScreenTimeCategoryRow]
    let segments: [ScreenTimeSegmentRow]
    let devices: [ScreenTimeDeviceRow]
}

private struct MutableAppBucket {
    var displayName: String
    var bundleIdentifier: String
    var duration: TimeInterval
    var pickups: Int
    var notifications: Int
}

private struct MutableCategoryBucket {
    var duration: TimeInterval
    var applications: [String: MutableAppBucket]
}

struct TotalActivityReport: DeviceActivityReportScene {
    let context: DeviceActivityReport.Context = .totalActivity
    let content: (TotalActivityConfiguration) -> TotalActivityView

    func makeConfiguration(
        representing data: DeviceActivityResults<DeviceActivityData>
    ) async -> TotalActivityConfiguration {
        var totalDuration: TimeInterval = 0
        var categoryBuckets: [String: MutableCategoryBucket] = [:]
        var segments: [ScreenTimeSegmentRow] = []
        var devices: [ScreenTimeDeviceRow] = []

        for await deviceData in data {
            let deviceName = deviceData.device.name ?? "未命名设备"
            let deviceModel = String(describing: deviceData.device.model)
            let deviceID = "\(deviceName)-\(deviceModel)"

            devices.append(
                ScreenTimeDeviceRow(
                    id: deviceID,
                    name: deviceName,
                    model: deviceModel,
                    lastUpdatedDate: deviceData.lastUpdatedDate
                )
            )

            for await segment in deviceData.activitySegments {
                totalDuration += segment.totalActivityDuration
                let longest = segment.longestActivity
                let segmentID =
                    "\(segment.dateInterval.start.timeIntervalSince1970)-" +
                    "\(segment.dateInterval.end.timeIntervalSince1970)-" +
                    deviceID

                segments.append(
                    ScreenTimeSegmentRow(
                        id: segmentID,
                        start: segment.dateInterval.start,
                        end: segment.dateInterval.end,
                        duration: segment.totalActivityDuration,
                        firstPickup: segment.firstPickup,
                        longestStart: longest?.start,
                        longestEnd: longest?.end,
                        pickupsWithoutApplication:
                            segment.totalPickupsWithoutApplicationActivity
                    )
                )

                for await categoryActivity in segment.categories {
                    let rawCategory =
                        categoryActivity.category.localizedDisplayName?
                            .trimmingCharacters(in: .whitespacesAndNewlines)
                    let categoryName =
                        rawCategory?.isEmpty == false ? rawCategory! : "其它"

                    var category =
                        categoryBuckets[categoryName]
                        ?? MutableCategoryBucket(
                            duration: 0,
                            applications: [:]
                        )

                    category.duration +=
                        categoryActivity.totalActivityDuration

                    for await applicationActivity
                        in categoryActivity.applications {
                        let application = applicationActivity.application
                        let bundleID =
                            application.bundleIdentifier
                            ?? "未知 Bundle ID"
                        let rawName =
                            application.localizedDisplayName?
                                .trimmingCharacters(
                                    in: .whitespacesAndNewlines
                                )
                        let displayName =
                            rawName?.isEmpty == false
                            ? rawName!
                            : bundleID
                        let appKey = "\(categoryName)|\(bundleID)"

                        var app =
                            category.applications[appKey]
                            ?? MutableAppBucket(
                                displayName: displayName,
                                bundleIdentifier: bundleID,
                                duration: 0,
                                pickups: 0,
                                notifications: 0
                            )

                        app.duration +=
                            applicationActivity.totalActivityDuration
                        app.pickups +=
                            applicationActivity.numberOfPickups
                        app.notifications +=
                            applicationActivity.numberOfNotifications
                        category.applications[appKey] = app
                    }

                    categoryBuckets[categoryName] = category
                }
            }
        }

        let categories = categoryBuckets.map { name, bucket in
            let apps = bucket.applications.values.map {
                ScreenTimeApplicationRow(
                    id: "\(name)|\($0.bundleIdentifier)",
                    displayName: $0.displayName,
                    bundleIdentifier: $0.bundleIdentifier,
                    duration: $0.duration,
                    pickups: $0.pickups,
                    notifications: $0.notifications
                )
            }.sorted {
                $0.duration == $1.duration
                ? $0.displayName < $1.displayName
                : $0.duration > $1.duration
            }

            return ScreenTimeCategoryRow(
                id: name,
                name: name,
                duration: bucket.duration,
                applications: apps
            )
        }.sorted {
            $0.duration == $1.duration
            ? $0.name < $1.name
            : $0.duration > $1.duration
        }

        segments.sort { $0.start < $1.start }
        devices.sort { $0.name < $1.name }

        return TotalActivityConfiguration(
            totalDuration: totalDuration,
            categories: categories,
            segments: segments,
            devices: devices
        )
    }
}
