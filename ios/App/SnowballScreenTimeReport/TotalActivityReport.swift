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
    let segmentStart: Date
    let segmentEnd: Date
    let categoryName: String
    let displayName: String
    let bundleIdentifier: String
    let duration: TimeInterval
    let pickups: Int
    let notifications: Int
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
    let segments: [ScreenTimeSegmentRow]
    let applications: [ScreenTimeApplicationRow]
    let devices: [ScreenTimeDeviceRow]
}

struct TotalActivityReport: DeviceActivityReportScene {
    let context: DeviceActivityReport.Context = .totalActivity
    let content: (TotalActivityConfiguration) -> TotalActivityView

    func makeConfiguration(
        representing data: DeviceActivityResults<DeviceActivityData>
    ) async -> TotalActivityConfiguration {
        var totalDuration: TimeInterval = 0
        var segments: [ScreenTimeSegmentRow] = []
        var applications: [ScreenTimeApplicationRow] = []
        var devices: [ScreenTimeDeviceRow] = []

        for await deviceData in data {
            let deviceName = deviceData.device.name ?? "未命名设备"
            let deviceModel = String(describing: deviceData.device.model)
            let deviceID = deviceName + "-" + deviceModel

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

                let start = segment.dateInterval.start
                let end = segment.dateInterval.end
                let longest = segment.longestActivity

                let segmentID =
                    String(start.timeIntervalSince1970) +
                    "-" +
                    String(end.timeIntervalSince1970) +
                    "-" +
                    deviceID

                segments.append(
                    ScreenTimeSegmentRow(
                        id: segmentID,
                        start: start,
                        end: end,
                        duration: segment.totalActivityDuration,
                        firstPickup: segment.firstPickup,
                        longestStart: longest?.start,
                        longestEnd: longest?.end,
                        pickupsWithoutApplication:
                            segment.totalPickupsWithoutApplicationActivity
                    )
                )

                for await categoryActivity in segment.categories {
                    let rawCategoryName =
                        categoryActivity.category.localizedDisplayName
                    let categoryName =
                        rawCategoryName?.isEmpty == false
                        ? rawCategoryName!
                        : "其它"

                    for await applicationActivity
                        in categoryActivity.applications {
                        let application =
                            applicationActivity.application

                        let bundleIdentifier =
                            application.bundleIdentifier
                            ?? "Apple 未返回 Bundle ID"

                        let rawDisplayName =
                            application.localizedDisplayName

                        let displayName =
                            rawDisplayName?.isEmpty == false
                            ? rawDisplayName!
                            : bundleIdentifier

                        let rowID =
                            segmentID +
                            "|" +
                            categoryName +
                            "|" +
                            bundleIdentifier

                        applications.append(
                            ScreenTimeApplicationRow(
                                id: rowID,
                                segmentStart: start,
                                segmentEnd: end,
                                categoryName: categoryName,
                                displayName: displayName,
                                bundleIdentifier: bundleIdentifier,
                                duration:
                                    applicationActivity
                                        .totalActivityDuration,
                                pickups:
                                    applicationActivity.numberOfPickups,
                                notifications:
                                    applicationActivity
                                        .numberOfNotifications
                            )
                        )
                    }
                }
            }
        }

        segments.sort { left, right in
            left.start < right.start
        }

        applications.sort { left, right in
            if left.segmentStart != right.segmentStart {
                return left.segmentStart < right.segmentStart
            }

            if left.duration != right.duration {
                return left.duration > right.duration
            }

            return left.displayName < right.displayName
        }

        devices.sort { left, right in
            left.name < right.name
        }

        return TotalActivityConfiguration(
            totalDuration: totalDuration,
            segments: segments,
            applications: applications,
            devices: devices
        )
    }
}
