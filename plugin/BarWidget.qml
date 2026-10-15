import QtQuick
import Quickshell
import Quickshell.Io
import qs.Ui

// Bar button that replaces the Omarchy menu button. Optional icon override in
// ~/.config/omarcast/config.json: { "barIcon": "\ue057", "barIconFont": "Font Awesome 7 Brands" }
BarWidget {
  id: root
  moduleName: "omarchy.menu"

  property string icon: "\ue900"
  property string iconFont: "omarchy"

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
      } catch (e) {}
    }
  }

  WidgetButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    text: root.icon
    fontFamily: root.iconFont
    horizontalMargin: 7.5
    onPressed: function(button) {
      if (!root.bar) return
      if (button === Qt.RightButton) root.bar.run("xdg-terminal-exec")
      else root.bar.run("omarchy-shell shell toggle omarchy.menu '{\"menu\":\"root\"}'")
    }
  }
}
