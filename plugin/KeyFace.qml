import QtQuick
import QtQuick.Effects
import qs.Commons

// A key standing off the body, lit from above: a face with a bright top
// edge, a darker lip below it and a short contact shadow. It fills its
// owner; the lip hangs just below. Pressed, or latched on (like a Braun
// radio's switch), the key sits down onto its lip: move the owner down by
// `sink`. Draws nothing extra at depth 0.
Item {
  id: key

  required property Material material
  property color face: material.key
  property bool hot: false
  property bool pressed: false
  property bool latched: false

  readonly property real d: material.depth
  readonly property real lip: Math.max(1, Math.round(Style.space(2) * d))
  readonly property bool down: (pressed || latched) && d > 0
  readonly property real sink: down ? lip : 0
  readonly property real r: Style.cornerRadius
  readonly property color body: latched ? Qt.tint(face, Qt.rgba(0, 0, 0, 0.06 * d))
    : (hot && !pressed ? Qt.tint(face, Qt.rgba(1, 1, 1, 0.18 * d)) : face)

  // Contact shadow, under the lip; it shortens as the key goes down.
  RectangularShadow {
    x: 0; width: parent.width
    y: key.lip - key.sink; height: parent.height
    offset.y: Style.space(1)
    blur: Style.space(3) * key.d
    radius: key.r
    color: Util.alpha(key.material.shadow, (key.down ? 0.10 : 0.22) * key.d)
  }

  // The lip: the key's side, seen from the front.
  Rectangle {
    x: 0; width: parent.width
    y: key.lip - key.sink; height: parent.height
    radius: key.r
    color: Qt.tint(key.face, Qt.rgba(0, 0, 0, 0.22 * key.d))
  }

  // The face: its edge catches the light at the top and falls off below.
  // Latched, it sits lower than the light, so the top edge goes dark.
  Rectangle {
    anchors.fill: parent
    radius: key.r
    gradient: Gradient {
      GradientStop { position: 0; color: key.latched ? Qt.tint(key.body, Qt.rgba(0, 0, 0, 0.16 * key.d)) : Qt.tint(key.body, Qt.rgba(1, 1, 1, 0.45 * key.d)) }
      GradientStop { position: 0.5; color: key.body }
      GradientStop { position: 1; color: Qt.tint(key.body, Qt.rgba(0, 0, 0, 0.10 * key.d)) }
    }

    Rectangle {
      anchors.fill: parent
      anchors.margins: Math.max(1, Style.spacing.hairline)
      radius: Math.max(0, key.r - anchors.margins)
      gradient: Gradient {
        GradientStop { position: 0; color: Qt.tint(key.body, Qt.rgba(key.latched ? 0 : 1, key.latched ? 0 : 1, key.latched ? 0 : 1, 0.04 * key.d)) }
        GradientStop { position: 1; color: Qt.tint(key.body, Qt.rgba(0, 0, 0, 0.02 * key.d)) }
      }
    }
  }
}
