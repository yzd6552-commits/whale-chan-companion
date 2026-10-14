import AppKit
// Artwork credits and license: src/assets/whale/NOTICE.md (CC BY-NC-SA 4.0).
let size = NSSize(width: 1024, height: 1024)
let image = NSImage(size: size)
image.lockFocus()
NSColor(calibratedRed: 0.91, green: 0.94, blue: 1, alpha: 1).setFill()
NSBezierPath(roundedRect: NSRect(x: 25, y: 25, width: 974, height: 974), xRadius: 215, yRadius: 215).fill()
NSColor.white.setFill()
NSBezierPath(roundedRect: NSRect(x: 78, y: 78, width: 868, height: 868), xRadius: 175, yRadius: 175).fill()
guard let character = NSImage(contentsOfFile: "src/assets/whale/avatar.png") else { fatalError("Missing licensed character asset") }
character.draw(in: NSRect(x: 100, y: 100, width: 824, height: 824), from: .zero, operation: .sourceOver, fraction: 1)
image.unlockFocus()
let bitmap = NSBitmapImageRep(data: image.tiffRepresentation!)!
try bitmap.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: CommandLine.arguments[1]))
