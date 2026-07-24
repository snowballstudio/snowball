import DeviceActivity
import ExtensionKit
import Foundation
import SwiftUI

extension DeviceActivityReport.Context {
    static let totalActivity = Self("Total Activity")
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
        var devices: [ScreenTimeDeviceRow] = []

        for await deviceData in data {
            let deviceName = deviceData.device.name ?? "未命名设备"
            let deviceModel = String(describing: deviceData.device.model)
            let deviceID = deviceName + "-" + deviceModel

            let deviceRow = ScreenTimeDeviceRow(
                id: deviceID,
                name: deviceName,
                model: deviceModel,
                lastUpdatedDate: deviceData.lastUpdatedDate
            )
            devices.append(deviceRow)

            for await segment in deviceData.activitySegments {
                totalDuration += segment.totalActivityDuration

                let longest = segment.longestActivity
                let startStamp = segment.dateInterval.start.timeIntervalSince1970
                let endStamp = segment.dateInterval.end.timeIntervalSince1970
                let segmentID = String(startStamp) + "-" + String(endStamp) + "-" + deviceID

                let row = ScreenTimeSegmentRow(
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
                segments.append(row)
            }
        }

        segments.sort { left, right in
            left.start < right.start
        }

        devices.sort { left, right in
            left.name < right.name
        }

        return TotalActivityConfiguration(
            totalDuration: totalDuration,
            segments: segments,
            devices: devices
        )
    }
}
