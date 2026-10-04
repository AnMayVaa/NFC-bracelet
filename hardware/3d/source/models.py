"""
Jeju wish-band: parametric 3D models (printable STL)

Devices
  admin      - admin desk unit: sloped shell + bottom plate for an ESP32 DevKit,
               a PN532 reader under a wristband tray, 12 mm buzzer and 5 mm LED
  station    - check-in station (food / place / activity): box base + lid for an
               ESP32 DevKit, an RC522 (or PN532) reader, 12 mm buzzer and 5 mm LED

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
    # --- admin desk unit -------------------------------------------------
    "adm_w": 110.0, "adm_d": 90.0,       # footprint
    "adm_front_h": 24.0,                 # shell height at the front edge
    "adm_slope": 18.0,                   # top slope in degrees (rear is higher)
    "adm_plate_t": 2.4,                  # bottom plate
    "pn532": (42.7, 40.4),               # PN532 V3 board
    "tray_d": 50.0, "tray_depth": 1.2,   # wristband tray on the sloped top
    "adm_reader_v": -4.0,                # reader/tray centre along the slope
    "adm_reader_u": -10.0,               # reader/tray centre across (x)
    "adm_esp32_x": 24.0,                 # ESP32 centre (x); USB faces the rear wall
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
    return trimesh.Trimesh(verts, faces, process=False)


# ---------------------------------------------------------------- admin desk unit
def adm_top_frame():
    """Height function and transform for the sloped top of the admin unit."""
    a = math.radians(P["adm_slope"])
    k = math.tan(a)
    z0 = P["adm_front_h"] + k * P["adm_d"] / 2      # top height at y = 0
    return a, k, z0


def on_top(m, u, v, extra=0.0):
    """Place a feature built in top-local coords (x = across, y = up the slope,
    z = out of the surface) onto the sloped top at (u, v)."""
    a, k, z0 = adm_top_frame()
    return m.translate((u, v, extra)).rotate((P["adm_slope"], 0, 0)).translate((0, 0, z0))


def adm_slope_cut(m, drop=0.0):
    """Keep the part of m that lies below the sloped top (lowered by `drop`, measured vertically)."""
    a, k, z0 = adm_top_frame()
    n = math.sqrt(1 + k * k)
    return m.trim_by_plane((0, k / n, -1 / n), -(z0 - drop) / n)


def admin_shell():
    W, D = P["adm_w"], P["adm_d"]
    t, rc = P["wall"], P["corner_r"]
    a, k, z0 = adm_top_frame()
    rear_h = z0 + k * D / 2
    tall = rear_h + 10
    outer = adm_slope_cut(rounded_slab(W, D, tall, rc))
    inner = adm_slope_cut(rrect(W - 2 * t, D - 2 * t, rc - t).extrude(tall + 2).translate((0, 0, -1)), drop=t / math.cos(a))
    shell = outer - inner
    # corner screw bosses (screws come up through the bottom plate)
    bx, by = W / 2 - 7, D / 2 - 7
    for sx in (-1, 1):
        for sy in (-1, 1):
            boss = adm_slope_cut(cyl(tall, 4.0).translate((sx * bx, sy * by, 0)), drop=1.0)
            shell = shell + boss
            shell = shell - cyl(12, P["screw_pilot_d"] / 2, seg=32).translate((sx * bx, sy * by, -0.01))
    # wristband tray: recessed dish with raised NFC waves + a front stop lip
    u0, v0 = P["adm_reader_u"], P["adm_reader_v"]
    td, tz = P["tray_d"], P["tray_depth"]
    shell = shell - on_top(cyl(tz + 2, td / 2), u0, v0, -tz)
    shell = shell + on_top(nfc_icon(tz), u0, v0, -tz)
    ring = cyl(0.6, td / 2 + 2.2) - cyl(2, td / 2 + 0.9).translate((0, 0, -0.5))
    shell = shell + on_top(ring, u0, v0, -0.01)
    lip = box(td * 0.7, 2.4, 3.0, False).translate((-td * 0.35, -td / 2 - 3.4, -0.5))
    shell = shell + on_top(lip, u0, v0)
    # PN532 frame under the top, centred under the tray
    pw, pd = P["pn532"]
    frame = box(pw + 4.4, pd + 4.4, 2.6) - box(pw + 0.6, pd + 0.6, 4)
    frame = frame - box(pw + 10, 12, 4).translate((0, pd / 2, 0))     # opening for the header + wires
    shell = shell + on_top(frame.translate((0, 0, -t - 1.3)), u0, v0)
    # buzzer grille + holder tube, LED window + holder (right side of the slope)
    bu, bv = 36.0, -22.0
    for dx, dy in [(0, 0)] + [(3.2 * math.cos(math.radians(q)), 3.2 * math.sin(math.radians(q))) for q in range(0, 360, 60)]:
        shell = shell - on_top(cyl(12, 0.9, seg=24).translate((dx, dy, -8)), bu, bv)
    tube = cyl(6.0, P["buzzer_d"] / 2 + 1.4) - cyl(7, P["buzzer_d"] / 2 + 0.2).translate((0, 0, -0.5))
    shell = shell + on_top(tube.translate((0, 0, -t - 6.0 + 0.01)), bu, bv)
    lu, lv = 36.0, 18.0
    shell = shell + on_top(cyl(0.8, P["led_d"] / 2 + 2.2), lu, lv, -0.01)
    shell = shell - on_top(cyl(20, P["led_d"] / 2 + 0.15, seg=48), lu, lv, -10)
    ltube = cyl(5.0, P["led_d"] / 2 + 1.4) - cyl(6, P["led_d"] / 2 + 0.15).translate((0, 0, -0.5))
    shell = shell + on_top(ltube.translate((0, 0, -t - 5.0 + 0.01)), lu, lv)
    # basalt pebble motif between LED and buzzer
    for (pu, pv, r) in [(38.0, -1.5, 3.4), (32.5, -2.4, 2.6), (35.6, 3.0, 2.4)]:
        pebble = sphere(1, 32).scale((r, r * 0.8, 0.9)).translate((pu, pv, -0.1))
        shell = shell + on_top(pebble ^ box(r * 3, r * 3, 2, False).translate((pu - r * 1.5, pv - r * 1.5, 0.05 - 0.1)), 0, 0)
    # USB cable opening in the rear wall, in line with the ESP32 port
    ex, ey = P["esp32"]
    uw, uh = P["usb_cut"]
    ux = P["adm_esp32_x"]
    uz = P["esp32_lift"] + 1.6 + 1.2
    shell = shell - rrect(uw, uh, 1.5).extrude(t * 3).rotate((-90, 0, 0)).translate((ux, D / 2 - 2 * t, uz)).rotate((0, 0, 0))
    # sea-wave grooves on the front face
    for z in (7.0, 11.0, 15.0):
        g = box(W - 2 * rc, 2, 0.9, False).translate((-(W - 2 * rc) / 2, -D / 2 - 1.4, z))
        shell = shell - g
    return shell


def admin_plate():
    W, D = P["adm_w"], P["adm_d"]
    t, rc, T = P["wall"], P["corner_r"], P["adm_plate_t"]
    plate = rounded_slab(W, D, T, rc, re_bot=1.2).translate((0, 0, -T))
    c = 0.25
    skirt = rrect(W - 2 * t - 2 * c, D - 2 * t - 2 * c, rc - t - c).extrude(3.0) - \
        rrect(W - 2 * t - 2 * c - 3.2, D - 2 * t - 2 * c - 3.2, rc - t - c - 1.6).extrude(4).translate((0, 0, -0.5))
    bx, by = W / 2 - 7, D / 2 - 7
    for sx in (-1, 1):
        for sy in (-1, 1):
            skirt = skirt - cyl(5, 4.6).translate((sx * bx, sy * by, -1))
    plate = plate + skirt
    for sx in (-1, 1):
        for sy in (-1, 1):
            plate = plate - cyl(10, P["screw_clear_d"] / 2, seg=32).translate((sx * bx, sy * by, -5))
            plate = plate - cyl(1.8, 3.3, P["screw_clear_d"] / 2, seg=32).translate((sx * bx, sy * by, -T - 0.01))
            plate = plate - cyl(0.8, P["foot_d"] / 2).translate((sx * (W / 2 - 16), sy * (D / 2 - 18), -T - 0.01))
    # ESP32 cradle, long side along Y, USB end at the rear wall
    ex, ey = P["esp32"]
    lift = P["esp32_lift"]
    xc = P["adm_esp32_x"]
    y_usb = D / 2 - t - 0.6
    plate = plate + box(ey + 4, 5.0, lift, False).translate((xc - (ey + 4) / 2, y_usb - 5.0, 0))
    plate = plate + box(ey + 4, 5.0, lift, False).translate((xc - (ey + 4) / 2, y_usb - ex, 0))
    plate = plate + box(ey + 4, 1.6, lift + 3.2, False).translate((xc - (ey + 4) / 2, y_usb - ex - 1.9, 0))
    return plate


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


def main():
    os.makedirs(OUT, exist_ok=True)
    parts = {
        "admin_shell": admin_shell(),
        "admin_bottom_plate": admin_plate(),
        "station_base": station_base(),
        "station_lid": station_lid(),
    }
    info = {}
    asm = os.path.join(HERE, "_render_parts")
    os.makedirs(asm, exist_ok=True)
    a = math.radians(P["adm_slope"])
    for name, m in parts.items():
        tm = to_trimesh(m)
        tm.export(os.path.join(asm, name + ".stl"))   # as-assembled orientation, for renders and drawings
        info[name] = {"watertight": bool(tm.is_watertight), "volume_cm3": round(float(tm.volume) / 1000, 2),
                      "size_mm": [round(float(v), 1) for v in (tm.bounds[1] - tm.bounds[0])],
                      "triangles": len(tm.faces)}
        pm = tm.copy()
        if name == "station_lid":      # print upside down: flat top on the bed
            pm.apply_transform(trimesh.transformations.rotation_matrix(math.pi, (1, 0, 0)))
        if name == "admin_shell":      # print on its sloped top: tilt the top flat, then flip
            pm.apply_transform(trimesh.transformations.rotation_matrix(-a, (1, 0, 0)))
            pm.apply_transform(trimesh.transformations.rotation_matrix(math.pi, (1, 0, 0)))
        pm.apply_translation((0, 0, -pm.bounds[0][2]))
        pm.export(os.path.join(OUT, name + ".stl"))
        print(name, info[name])
    with open(os.path.join(OUT, "scene.json"), "w") as fh:
        json.dump({"params": P, "parts": info}, fh, indent=1)


if __name__ == "__main__":
    main()
