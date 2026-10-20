import QtQuick
import "lib/Search.js" as Search

// Highlight with separate PlainText runs. Names, URLs and window titles never
// become markup, even if they contain <img>, ampersands or angle brackets.
Item {
  id: root
  property string text: ""
  property var positions: []
  property color color: "white"
  property color matchColor: color
  property font font: Qt.font({ pixelSize: 16 })
  readonly property var runs: Search.matchRuns(elision.elidedText, root.positions)
  implicitWidth: metrics.advanceWidth(root.text)
  implicitHeight: metrics.height
  height: implicitHeight
  clip: true

  FontMetrics {
    id: metrics
    font: root.font
  }
  TextMetrics {
    id: elision
    font: root.font
    text: root.text
    elide: Text.ElideRight
    elideWidth: Math.max(0, root.width)
  }
  Row {
    anchors.verticalCenter: parent.verticalCenter
    Repeater {
      model: root.runs
      delegate: Text {
        required property var modelData
        text: modelData.text
        textFormat: Text.PlainText
        font: root.font
        color: modelData.matched ? root.matchColor : root.color
        Rectangle {
          visible: modelData.matched
          x: 0
          y: parent.baselineOffset + 2
          width: parent.implicitWidth
          height: 1
          color: root.matchColor
        }
      }
    }
  }
}
