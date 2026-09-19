import UIKit
import Capacitor
import GoogleSignIn

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = CAPBridgeViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        // Google Sign-In's redirect back into the app. This is a scene-based app,
        // so iOS delivers opened URLs here, not to AppDelegate as the plugin's
        // docs show. Anything Google doesn't claim goes on to Capacitor.
        let unclaimed = URLContexts.filter { !GIDSignIn.sharedInstance.handle($0.url) }
        if !unclaimed.isEmpty {
            SceneDelegateProxy.shared.scene(scene, openURLContexts: unclaimed)
        }
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
