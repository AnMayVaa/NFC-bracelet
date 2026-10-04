"""
Jeju wish-band: parametric 3D models (printable STL)

Parts
  wristband  - Hallabong charm base + cap (holds a 25 mm NTAG215 NFC tag),
               basalt beads, UV bead (print in UV colour-change filament)
  station    - check-in station enclosure (base + lid) for an ESP32 DevKit,
               an RC522 (or PN532) reader, a 12 mm buzzer and a 5 mm LED

Run:  python3 models.py            -> writes ../stl/*.stl and ../stl/scene.json
Needs: pip install manifold3d trimesh numpy

All sizes are millimetres. Change the numbers in PARAMS and re-run.
"""
import json
import math
import os
import random

import numpy as np
import trimesh
from manifold3d import CrossSection, JoinType, Manifold

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "stl")

PARAMS = {
    # --- wristband -------------------------------------------------------
    "cord_hole_d": 2.0,          # 1.0 mm elastic cord, threaded twice through beads
    "bead_d": 10.0,              # basalt bead
    "uv_bead_d": 12.0,           # photochromic UV bead
    "bead_flat": 0.8,            # flats cut at both hole ends (prints with no support)
    "tag_d": 25.0,               # NTAG215 coin sticker, 25 mm
    "tag_t": 1.0,                # tag thickness incl. adhesive
    "charm_d": 34.0,             # charm base outer diameter
    "charm_base_h": 6.0,         # base height to the tag shelf
    "charm_rim_h": 1.5,          # rim that locates the cap
    "charm_rim_w": 1.0,
    "charm_cap_h": 8.5,          # cap dome height (without knob and stem)
    "fit_clearance": 0.2,        # cap-in-rim gap (per side)
    "channel_d": 2.4,            # cord channel through the charm base
    "wrist_sizes": {"S": 150, "M": 165, "L": 180},   # inner wrist circumference
    # --- station ---------------------------------------------------------
    "box_w": 100.0, "box_d": 76.0, "box_h": 40.0,    # base outer size
    "lid_t": 3.0,                # lid thickness (reader reads through 2.2 mm)
    "corner_r": 10.0, "edge_r": 3.0,
    "wall": 2.4, "floor": 2.4,
    "tap_d": 46.0, "tap_depth": 0.8,
    "tap_x": -3.0,               # tap circle centre (x) on the lid
    "reader_x": -13.0,           # RC522 board centre (x); antenna end under the tap circle
    "rc522": (60.0, 40.0),       # RC522 board (PN532 V3 42.7 x 40.4 also fits)
    "esp32": (54.4, 27.9),       # ESP32 DevKitC V4
    "esp32_lift": 9.0,           # room for header pins under the board
    "usb_cut": (12.0, 8.0),      # width x height of the USB opening
    "buzzer_d": 12.0, "led_d": 5.0,
    "screw_pilot_d": 2.5,        # M3 self-tapping screw pilot hole
    "screw_clear_d": 3.4,
    "foot_d": 10.0,              # rubber foot recess
}
P = PARAMS
SEG = 96
random.seed(7)


# ---------------------------------------------------------------- helpers
def cyl(h, r, r2=None, seg=SEG, center=False):
    return Manifold.cylinder(h, r, r if r2 is None else r2, seg, center)


def box(x, y, z, center=True):
    return Manifold.cube((x, y, z), center)


def sphere(r, seg=SEG):
    return Manifold.sphere(r, seg)


def rrect(w, d, r):
    """Rounded rectangle cross-section centred on the origin."""
    r = max(0.01, min(r, w / 2 - 0.01, d / 2 - 0.01))
    return CrossSection.square((w - 2 * r, d - 2 * r), True).offset(r, JoinType.Round, 2.0, SEG)


def rounded_slab(w, d, h, rc, re_bot=0.0, re_top=0.0, steps=8):
    """Rounded-rectangle prism with rounded bottom and/or top edges (hull of slices)."""
    slices = []
    def ring(z, inset):
        return rrect(w - 2 * inset, d - 2 * inset, rc - inset).extrude(0.01).translate((0, 0, z))
    for i in range(steps + 1):
        a = math.pi / 2 * i / steps
        if re_bot:
            slices.append(ring(re_bot - re_bot * math.sin(a), re_bot - re_bot * math.cos(a)))
        if re_top:
            slices.append(ring(h - re_top + re_top * math.sin(a) - 0.01, re_top - re_top * math.cos(a)))
    if not re_bot:
        slices.append(ring(0, 0))
    if not re_top:
        slices.append(ring(h - 0.01, 0))
    return Manifold.batch_hull(slices)


def surface_points(n, rx, ry, rz, zmin=-1e9, zmax=1e9, min_gap=0.0):
    """Random points on an ellipsoid surface (rejection sampled, spaced apart)."""
    pts = []
    tries = 0
    while len(pts) < n and tries < 20000:
        tries += 1
        v = np.random.default_rng(tries).normal(size=3)
        v /= np.linalg.norm(v)
        p = np.array([v[0] * rx, v[1] * ry, v[2] * rz])
        if not (zmin <= p[2] <= zmax):
            continue
        if any(np.linalg.norm(p - q) < min_gap for q in pts):
            continue
        pts.append(p)
    return pts


def to_trimesh(m):
    mesh = m.to_mesh()
    verts = np.asarray(mesh.vert_properties)[:, :3]
    faces = np.asarray(mesh.tri_verts)
    return trimesh.Trimesh(verts, faces, process=True)


# ---------------------------------------------------------------- wristband
def bead(d, textured):
    r = d / 2
    b = sphere(r, 64)
    if textured:  # basalt pores
        for i, p in enumerate(surface_points(34, r, r, r, -r + 1.6, r - 1.6, 1.6)):
            pr = 0.45 + 0.35 * ((i * 37) % 10) / 10
            b = b - sphere(pr, 16).translate(tuple(p * (1 + pr * 0.35 / r)))
    zc = r - P["bead_flat"]
    b = b ^ box(d + 2, d + 2, 2 * zc)
    b = b - cyl(d + 2, P["cord_hole_d"] / 2, center=True, seg=32)
    # small countersink at each hole end so the cord slides smoothly
    cs = cyl(0.8, P["cord_hole_d"] / 2 + 0.6, P["cord_hole_d"] / 2, seg=32)
    b = b - cs.translate((0, 0, -zc)) - cs.rotate((180, 0, 0)).translate((0, 0, zc))
    return b.translate((0, 0, zc))  # sits on the bed


def charm_base():
    R = P["charm_d"] / 2
    h, rim_h, rim_w = P["charm_base_h"], P["charm_rim_h"], P["charm_rim_w"]
    body = Manifold.batch_hull([cyl(0.01, R - 0.8), cyl(h + rim_h - 0.8, R).translate((0, 0, 0.8)),
                                cyl(0.01, R - 0.4).translate((0, 0, h + rim_h - 0.01))])
    # hollow above the shelf, inside the rim
    body = body - cyl(rim_h + 1, R - rim_w).translate((0, 0, h))
    # tag pocket
    body = body - cyl(P["tag_t"] + 0.4 + 1, P["tag_d"] / 2 + 0.3).translate((0, 0, h - P["tag_t"] - 0.4))
    # cord channel along X, centred low in the base
    ch = cyl(P["charm_d"] + 4, P["channel_d"] / 2, center=True, seg=32).rotate((0, 90, 0))
    body = body - ch.translate((0, 0, 2.2))
    # flare the channel mouths
    flare = cyl(1.2, P["channel_d"] / 2 + 0.8, P["channel_d"] / 2, seg=32).rotate((0, 90, 0))
    body = body - flare.translate((-(R - 0.4) - 0.2, 0, 2.2)) - flare.rotate((0, 0, 180)).translate((R - 0.4 + 0.2, 0, 2.2))
    return body


def charm_cap():
    R = P["charm_d"] / 2 - P["charm_rim_w"] - P["fit_clearance"]
    H = P["charm_cap_h"]
    dome = sphere(1, 128).scale((R, R, H)) ^ box(3 * R, 3 * R, H + 1, False).translate((-1.5 * R, -1.5 * R, 0))
    # Hallabong "top knot"
    knot = sphere(5.2, 64).scale((1, 1, 0.75)).translate((0, 0, H - 1.0))
    cap = dome + knot
    # citrus peel dimples
    for p in surface_points(46, R, R, H, 1.8, H - 2.2, 2.6):
        cap = cap - sphere(0.65, 16).translate(tuple(p * 1.012))
    stem = cyl(2.4, 1.3, 1.0, seg=32).translate((0, 0, H + 2.4))
    leaf = sphere(1, 48).scale((6.2, 2.8, 1.0)).rotate((0, 22, 25)).translate((5.0, 2.3, H + 1.1))
    vein = box(9, 0.45, 0.5).rotate((0, 22, 25)).translate((5.0, 2.3, H + 2.0))
    return cap + stem + leaf - vein


# ---------------------------------------------------------------- station
def station_base():
    W, D, H = P["box_w"], P["box_d"], P["box_h"]
    t, f, rc = P["wall"], P["floor"], P["corner_r"]
    shell = rounded_slab(W, D, H, rc, re_bot=P["edge_r"])
    shell = shell - rrect(W - 2 * t, D - 2 * t, rc - t).extrude(H).translate((0, 0, f))
    # corner screw bosses
    bx, by = W / 2 - 7, D / 2 - 7
    for sx in (-1, 1):
        for sy in (-1, 1):
            boss = cyl(H - f, 4.0).translate((sx * bx, sy * by, f))
            shell = shell + boss
            shell = shell - cyl(14, P["screw_pilot_d"] / 2, seg=32).translate((sx * bx, sy * by, H - 13.9))
    # ESP32 cradle: two end blocks with lips (pins hang free in between)
    ex, ey = P["esp32"]
    lift = P["esp32_lift"]
    x0 = -W / 2 + t + 0.6           # USB end against the left wall
    for xe, sgn in ((x0, 1), (x0 + ex, -1)):
        blk = box(5.0, ey + 4, lift, False).translate((xe - (0 if sgn > 0 else 5.0), -(ey + 4) / 2, f))
        shell = shell + blk
        if sgn < 0:   # far end gets a retaining lip; the near end is held by the wall
            shell = shell + box(1.6, ey + 4, lift + 3.2, False).translate((xe + 0.3, -(ey + 4) / 2, f))
    # USB opening in the left wall, centred on the board
    uw, uh = P["usb_cut"]
    usb = rrect(uw, uh, 1.5).extrude(t * 3).rotate((0, 90, 0)).translate((-W / 2 - t, 0, f + lift + 1.6 + 1.2))
    shell = shell - usb
    # sea-wave grooves around the front and back faces
    for z in (14.0, 19.0, 24.0):
        g = rrect(W + 2, D - 2 * rc, 0.4).extrude(0.9).translate((0, 0, z))
        shell = shell - (g - rrect(W - 1.2, D, 0.1).extrude(2).translate((0, 0, z - 0.5)))
        g2 = rrect(W - 2 * rc, D + 2, 0.4).extrude(0.9).translate((0, 0, z))
        shell = shell - (g2 - rrect(W, D - 1.2, 0.1).extrude(2).translate((0, 0, z - 0.5)))
    # rubber foot recesses
    for sx in (-1, 1):
        for sy in (-1, 1):
            shell = shell - cyl(0.8, P["foot_d"] / 2).translate((sx * (W / 2 - 14), sy * (D / 2 - 12), -0.01))
    # cable tie / wiring slot for the reader cable is not needed: everything is inside.
    return shell


def nfc_icon(depth):
    """Raised NFC 'waves' inside the tap circle (dot + three arcs)."""
    out = cyl(depth, 2.2).translate((-9, 0, 0))
    for i, r in enumerate((7.0, 12.0, 17.0)):
        ring = cyl(depth, r + 1.1) - cyl(depth + 1, r - 1.1).translate((0, 0, -0.5))
        wedge = Manifold.extrude(CrossSection([[(0, 0), (40 * math.cos(math.radians(-50)), 40 * math.sin(math.radians(-50))),
                                               (40, 0), (40 * math.cos(math.radians(50)), 40 * math.sin(math.radians(50)))]]), depth)
        out = out + (ring ^ wedge).translate((-9, 0, 0))
    return out


def station_lid():
    W, D = P["box_w"], P["box_d"]
    t, rc, T = P["wall"], P["corner_r"], P["lid_t"]
    lid = rounded_slab(W, D, T, rc, re_top=P["edge_r"] * 0.8)
    # locating skirt under the lid
    c = 0.25
    skirt_out = rrect(W - 2 * t - 2 * c, D - 2 * t - 2 * c, rc - t - c)
    skirt = skirt_out.extrude(4.0) - rrect(W - 2 * t - 2 * c - 3.2, D - 2 * t - 2 * c - 3.2, rc - t - c - 1.6).extrude(5).translate((0, 0, -0.5))
    bx, by = W / 2 - 7, D / 2 - 7
    for sx in (-1, 1):
        for sy in (-1, 1):
            skirt = skirt - cyl(6, 4.6).translate((sx * bx, sy * by, -1))
    lid = lid + skirt.translate((0, 0, -4.0))
    # screw holes with countersink
    for sx in (-1, 1):
        for sy in (-1, 1):
            lid = lid - cyl(20, P["screw_clear_d"] / 2, seg=32).translate((sx * bx, sy * by, -10))
            lid = lid - cyl(1.8, P["screw_clear_d"] / 2, 3.3, seg=32).translate((sx * bx, sy * by, T - 1.79))
    # tap zone: recessed circle with raised NFC waves and a ring
    tz = P["tap_depth"]
    tx = P["tap_x"]
    lid = lid - cyl(tz + 1, P["tap_d"] / 2).translate((tx, 0, T - tz))
    lid = lid + nfc_icon(tz).translate((tx, 0, T - tz))
    lid = lid + (cyl(0.6, P["tap_d"] / 2 + 2.2) - cyl(2, P["tap_d"] / 2 + 0.9).translate((0, 0, -0.5))).translate((tx, 0, T - 0.01))
    # reader frame under the lid (RC522 antenna centred under the tap zone)
    rw, rd = P["rc522"]
    rx0 = P["reader_x"]
    frame = box(rw + 4.4, rd + 4.4, 2.6) - box(rw + 0.6, rd + 0.6, 4)
    frame = frame - box(16, rd + 10, 4).translate((rx0 - rw / 2, 0, 0))      # opening for header + wires
    lid = lid + frame.translate((rx0, 0, -1.3))
    # buzzer grille and holder tube (front-right corner)
    bxp, byp = 31.0, -20.0
    for dx, dy in [(0, 0)] + [(3.2 * math.cos(math.radians(a)), 3.2 * math.sin(math.radians(a))) for a in range(0, 360, 60)]:
        lid = lid - cyl(10, 0.9, seg=24).translate((bxp + dx, byp + dy, -5))
    tube = cyl(6.0, P["buzzer_d"] / 2 + 1.4) - cyl(7, P["buzzer_d"] / 2 + 0.2).translate((0, 0, -0.5))
    lid = lid + tube.translate((bxp, byp, -6.0))
    # LED window + holder (back-right corner) with a small raised bezel
    lx, ly = 31.0, 20.0
    lid = lid + cyl(0.8, P["led_d"] / 2 + 2.2).translate((lx, ly, T - 0.01))
    lid = lid - cyl(20, P["led_d"] / 2 + 0.15, seg=48).translate((lx, ly, -10))
    ltube = cyl(5.0, P["led_d"] / 2 + 1.4) - cyl(6, P["led_d"] / 2 + 0.15).translate((0, 0, -0.5))
    lid = lid + ltube.translate((lx, ly, -5.0))
    # small basalt-stone stamp mark: three stacked pebbles (Jeju stone wall motif)
    for (px, py, r) in [(36.0, -1.5, 3.4), (30.5, -2.4, 2.6), (33.6, 3.0, 2.4)]:
        pebble = sphere(1, 32).scale((r, r * 0.8, 0.9)).translate((px, py, T - 0.1))
        lid = lid + (pebble ^ box(r * 3, r * 3, 2, False).translate((px - r * 1.5, py - r * 1.5, T - 0.05)))
    return lid


# ---------------------------------------------------------------- bracelet layout
def bracelet_layout(size="M"):
    """Count beads for a wrist size and return their positions on the centre-line circle."""
    C = P["wrist_sizes"][size]
    R = C / (2 * math.pi) + P["bead_d"] / 2
    total = 2 * math.pi * R
    n = int((total - P["charm_d"] - P["uv_bead_d"]) // P["bead_d"])
    gap = (total - P["charm_d"] - P["uv_bead_d"] - n * P["bead_d"]) / (n + 2)
    items = [("charm", P["charm_d"]), ("uv", P["uv_bead_d"])] + [("bead", P["bead_d"])] * n
    s = -P["charm_d"] / 2
    out = []
    for kind, L in items:
        mid = s + L / 2
        out.append((kind, mid / R))   # angle in radians
        s += L + gap
    return R, n, out


def main():
    os.makedirs(OUT, exist_ok=True)
    parts = {
        "wristband_charm_base": charm_base(),
        "wristband_charm_cap": charm_cap(),
        "wristband_basalt_bead": bead(P["bead_d"], True),
        "wristband_uv_bead": bead(P["uv_bead_d"], False),
        "station_base": station_base(),
        "station_lid": station_lid(),
    }
    info = {}
    asm = os.path.join(HERE, "_render_parts")
    os.makedirs(asm, exist_ok=True)
    for name, m in parts.items():
        tm = to_trimesh(m)
        tm.export(os.path.join(asm, name + ".stl"))   # as-assembled orientation, for renders
        if name == "station_lid":   # print upside down: flat top on the bed
            tm.apply_transform(trimesh.transformations.rotation_matrix(math.pi, (1, 0, 0)))
            tm.apply_translation((0, 0, -tm.bounds[0][2]))
        tm.export(os.path.join(OUT, name + ".stl"))
        info[name] = {"watertight": bool(tm.is_watertight), "volume_cm3": round(float(tm.volume) / 1000, 2),
                      "size_mm": [round(float(v), 1) for v in (tm.bounds[1] - tm.bounds[0])],
                      "triangles": len(tm.faces)}
        print(name, info[name])
    layouts = {}
    for s in P["wrist_sizes"]:
        R, n, items = bracelet_layout(s)
        layouts[s] = {"centre_radius": round(R, 2), "basalt_beads": n, "items": items}
        print(f"wrist {s}: {n} basalt beads + 1 UV bead + charm, centre-line radius {R:.1f} mm")
    with open(os.path.join(OUT, "scene.json"), "w") as fh:
        json.dump({"params": {k: v for k, v in P.items()}, "parts": info, "bracelet": layouts}, fh, indent=1)


if __name__ == "__main__":
    main()
