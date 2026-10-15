// Dev harness: loads ../plugin/Omarcast.qml outside omarchy-shell, with the
// real Omarchy Commons/Ui modules, so QML errors are printed directly.
//   qs -p dev            (then: qs ipc -p dev call dev open '{"query":"1+1"}')
import Quickshell
import Quickshell.Io
import QtQuick

ShellRoot {
  id: shellRoot
  Loader {
    id: loader
    source: Qt.resolvedUrl("plugin/Omarcast.qml")
    onStatusChanged: if (status === Loader.Error) console.warn("omarcast: load error")
    onLoaded: {
      item.omarchyPath = Quickshell.env("OMARCHY_PATH") || "/usr/share/omarchy"
      item.shell = { hide: function() { item.close(); return true } }
      item.open(Quickshell.env("OMARCAST_PAYLOAD") || "{}")
    }
  }
  IpcHandler {
    target: "dev"
    function open(payload: string): void { loader.item.open(payload) }
    function close(): void { loader.item.close() }
  }
}
