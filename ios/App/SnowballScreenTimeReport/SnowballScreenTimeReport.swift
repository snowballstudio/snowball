//
//  SnowballScreenTimeReport.swift
//  SnowballScreenTimeReport
//
//  Created by Jason Zhao on 24/7/2026.
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
