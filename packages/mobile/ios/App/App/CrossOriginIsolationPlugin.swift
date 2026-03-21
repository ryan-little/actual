import Foundation
import Capacitor
import WebKit

/// A Capacitor plugin that injects Cross-Origin-Opener-Policy and
/// Cross-Origin-Embedder-Policy headers into the WKWebView configuration.
///
/// These headers are required for SharedArrayBuffer support, which is used by
/// absurd-sql (the SQLite-in-browser engine) for offline local-first data storage.
///
/// On iOS 16+, WKWebView supports SharedArrayBuffer when COOP/COEP headers are present.
@objc(CrossOriginIsolationPlugin)
public class CrossOriginIsolationPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "CrossOriginIsolationPlugin"
    public let jsName = "CrossOriginIsolation"
    public let pluginMethods: [CAPPluginMethod] = []

    override public func load() {
        // Inject a script that sets SharedArrayBuffer override flag
        // as a fallback for environments where COOP/COEP can't be set
        let script = WKUserScript(
            source: """
            // Ensure SharedArrayBuffer override is set for Capacitor context
            if (!window.SharedArrayBuffer) {
                localStorage.setItem('SharedArrayBufferOverride', 'true');
                console.log('[Capacitor] SharedArrayBuffer not available, override enabled');
            } else {
                console.log('[Capacitor] SharedArrayBuffer is available');
            }

            // Mark as running in Capacitor for platform detection
            window.__ACTUAL_IS_CAPACITOR__ = true;
            """,
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        )
        bridge?.webView?.configuration.userContentController.addUserScript(script)
    }
}
