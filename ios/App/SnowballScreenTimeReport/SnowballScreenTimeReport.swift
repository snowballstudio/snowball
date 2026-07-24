//
//  SnowballScreenTimeReport.swift
//  SnowballScreenTimeReport
//

import DeviceActivity
import ExtensionKit
import SwiftUI

@main
struct SnowballScreenTimeReport: DeviceActivityReportExtension {
    var body: some DeviceActivityReportScene {
        TotalActivityReport { configuration in
            TotalActivityView(configuration: configuration)
        }
    }
}
