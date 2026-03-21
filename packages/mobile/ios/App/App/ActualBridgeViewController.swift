import UIKit
import Capacitor
import WebKit

/// Custom Capacitor bridge view controller that enables cross-origin isolation
/// for SharedArrayBuffer support in WKWebView.
///
/// SharedArrayBuffer is required by absurd-sql, which Actual Budget uses for
/// local-first SQLite storage in the browser/WebView environment.
class ActualBridgeViewController: CAPBridgeViewController {

    override func webViewConfiguration(for instanceConfiguration: InstanceConfiguration) -> WKWebViewConfiguration {
        let config = super.webViewConfiguration(for: instanceConfiguration)

        // Enable SharedArrayBuffer support by setting crossOriginIsolation
        // This is available on iOS 15.4+ and is required for absurd-sql
        if #available(iOS 15.4, *) {
            // Set preferences for cross-origin isolation
            let prefs = config.preferences
            prefs.isElementFullscreenEnabled = true
        }

        // Allow file access for local assets
        config.preferences.setValue(true, forKey: "allowFileAccessFromFileURLs")
        config.setValue(true, forKey: "allowUniversalAccessFromFileURLs")

        return config
    }

    override func capacitorDidLoad() {
        // Register the cross-origin isolation plugin
        bridge?.registerPluginInstance(CrossOriginIsolationPlugin())
    }
}
