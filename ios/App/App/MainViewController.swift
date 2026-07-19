import UIKit
import Capacitor

@objc(MainViewController)
public final class MainViewController: CAPBridgeViewController {
    public override func capacitorDidLoad() {
        super.capacitorDidLoad()
        bridge?.registerPluginInstance(DeviceDataPlugin())
    }
}
