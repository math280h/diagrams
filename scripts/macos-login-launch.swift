import AppKit
import CoreGraphics

let usage = "Usage: swift scripts/macos-login-launch.swift <app bundle> <login|normal> <user data folder>"
let arguments = CommandLine.arguments
guard arguments.count == 4, ["login", "normal"].contains(arguments[2]) else {
  print(usage)
  exit(2)
}
let appURL = URL(fileURLWithPath: arguments[1])
let atLogin = arguments[2] == "login"
let userData = arguments[3]
let tokenFile = URL(fileURLWithPath: userData).appendingPathComponent("agent-token").path
let startTimeoutSeconds = 60.0
let windowWaitSeconds = 15.0
let pollSeconds = 0.25

let configuration = NSWorkspace.OpenConfiguration()
configuration.createsNewApplicationInstance = true
configuration.activates = !atLogin
var environment = ProcessInfo.processInfo.environment.filter { $0.key.hasPrefix("DIAGRAMS_") }
environment["DIAGRAMS_USER_DATA"] = userData
configuration.environment = environment
if atLogin {
  // Electron sets wasOpenedAtLogin when the open application event has keyAELaunchedAsLogInItem as keyAEPropData.
  let event = NSAppleEventDescriptor(
    eventClass: AEEventClass(kCoreEventClass),
    eventID: AEEventID(kAEOpenApplication),
    targetDescriptor: nil,
    returnID: AEReturnID(kAutoGenerateReturnID),
    transactionID: AETransactionID(kAnyTransactionID)
  )
  event.setParam(NSAppleEventDescriptor(enumCode: OSType(keyAELaunchedAsLogInItem)), forKeyword: AEKeyword(keyAEPropData))
  configuration.appleEvent = event
}

var launched: NSRunningApplication?
let opened = DispatchSemaphore(value: 0)
NSWorkspace.shared.openApplication(at: appURL, configuration: configuration) { app, error in
  if let error {
    print("Could not open \(appURL.path): \(error.localizedDescription)")
    exit(1)
  }
  launched = app
  opened.signal()
}
opened.wait()
guard let app = launched else { exit(1) }
let pid = app.processIdentifier

func appWindowCount() -> Int {
  let windows = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID)
    as? [[String: Any]] ?? []
  return windows.filter {
    ($0[kCGWindowOwnerPID as String] as? Int32) == pid && ($0[kCGWindowLayer as String] as? Int) == 0
  }.count
}

func finish(_ code: Int32, _ message: String) -> Never {
  print(message)
  app.forceTerminate()
  exit(code)
}

let startDeadline = Date().addingTimeInterval(startTimeoutSeconds)
while !FileManager.default.fileExists(atPath: tokenFile) {
  if app.isTerminated { finish(1, "The app stopped before it started its agent server.") }
  if Date() > startDeadline { finish(1, "The app did not start its agent server in \(Int(startTimeoutSeconds)) s.") }
  Thread.sleep(forTimeInterval: pollSeconds)
}

var mostWindows = 0
let windowDeadline = Date().addingTimeInterval(windowWaitSeconds)
while Date() < windowDeadline {
  mostWindows = max(mostWindows, appWindowCount())
  if !atLogin && mostWindows > 0 { break }
  Thread.sleep(forTimeInterval: pollSeconds)
}

if atLogin && mostWindows > 0 {
  finish(1, "A start at sign-in showed \(mostWindows) window(s). It must show none.")
}
if !atLogin && mostWindows == 0 {
  finish(1, "A normal start showed no window in \(Int(windowWaitSeconds)) s, so this test cannot see windows.")
}
finish(0, atLogin ? "A start at sign-in showed no window." : "A normal start showed the window.")
