"""Generate a valid synthetic font for complete extraction-cache fixtures.

Only a private-use character is mapped, so normal menu text keeps using its system fallback.
Requires fonttools for regeneration only; tests use the checked-in tiny font files.
"""
from pathlib import Path
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen

builder = FontBuilder(1000, isTTF=True)
builder.setupGlyphOrder([".notdef", "fixture"])
builder.setupCharacterMap({0xE000: "fixture"})
builder.setupGlyf({name: TTGlyphPen(None).glyph() for name in [".notdef", "fixture"]})
builder.setupHorizontalMetrics({name: (500, 0) for name in [".notdef", "fixture"]})
builder.setupHorizontalHeader(ascent=800, descent=-200)
builder.setupNameTable({"familyName": "Launcher Test Font", "styleName": "Regular",
                       "uniqueFontIdentifier": "LauncherTestFont", "fullName": "Launcher Test Font",
                       "psName": "LauncherTestFont"})
builder.setupOS2(sTypoAscender=800, sTypoDescender=-200, usWinAscent=800, usWinDescent=200)
builder.setupPost()
builder.setupMaxp()
builder.font.recalcTimestamp = False
builder.font["head"].created = builder.font["head"].modified = 2082844800
for game in ["mg12", "mgs2", "mgs3", "mgs4", "mgspw"]:
    builder.save(Path(__file__).parent / "assets" / game / "test-font.ttf")
