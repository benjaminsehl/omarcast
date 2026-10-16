import QtQuick
import QtQuick.Effects
import Quickshell
import Quickshell.Io
import qs.Commons
import qs.Ui

// Bar button that replaces the Omarchy menu button. Optional icon override in
// ~/.config/omarcast/config.json, either a glyph:
//   { "barIcon": "\ue057", "barIconFont": "Font Awesome 7 Brands" }
// or an image, painted in the bar's text colour:
//   { "barIconImage": "~/path/to/logo.svg" }
BarWidget {
  id: root
  moduleName: "omarchy.menu"

  property string icon: "\ue900"
  property string iconFont: "omarchy"
  property string iconImage: ""
  readonly property real imageSize: Math.round(button.fontSize * 1.05)

  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

  FileView {
    path: (Quickshell.env("XDG_CONFIG_HOME") || Quickshell.env("HOME") + "/.config") + "/omarcast/config.json"
    watchChanges: true
    printErrors: false
    onFileChanged: reload()
    onLoaded: {
      try {
        var c = JSON.parse(text()) || {}
        root.icon = c.barIcon || "\ue900"
        root.iconFont = c.barIconFont || (c.barIcon ? "" : "omarchy")
        root.iconImage = String(c.barIconImage || "").replace(/^~(?=\/)/, Quickshell.env("HOME"))
      } catch (e) {}
    }
  }

  WidgetButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    text: root.iconImage ? " " : root.icon
    fontFamily: root.iconFont
    labelVisible: !root.iconImage
    fixedWidth: root.iconImage ? root.imageSize + Style.spaceReal(7.5) * 2 : -1
    horizontalMargin: 7.5
    onPressed: function(button) {
      if (!root.bar) return
      if (button === Qt.RightButton) root.bar.run("xdg-terminal-exec")
      else root.bar.run("omarchy-shell shell toggle omarchy.menu '{\"menu\":\"root\"}'")
    }
  }

  // The image is brightened to white and tinted with the bar's text colour,
  // so it follows the theme whatever colour the file is drawn in.
  Image {
    visible: root.iconImage !== ""
    anchors.centerIn: button
    width: root.imageSize
    height: root.imageSize
    opacity: button.opacity
    source: root.iconImage ? "file://" + root.iconImage : ""
    sourceSize: Qt.size(width * 2, height * 2)
    smooth: true
    layer.enabled: true
    layer.effect: MultiEffect {
      brightness: 1.0
      colorization: 1.0
      colorizationColor: button.foreground
    }
  }
}
