"""
Dimensioned drawings for the Jeju wish-band devices (admin desk unit, check-in station).
Writes ../drawings/jeju-wish-band-3d-drawings.pdf (A3, two sheets) and a PNG of each sheet.
Drawn at true scale: print the PDF on A3 at 100 % and the stated scale holds.

Run after models.py:  python3 drawing.py
Needs: pip install matplotlib shapely trimesh numpy
"""
import json
import math
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.backends.backend_pdf import PdfPages
from matplotlib.patches import Circle, FancyBboxPatch, Rectangle
import numpy as np
import trimesh
from shapely.geometry import Polygon, MultiPolygon
from shapely.ops import unary_union

HERE = os.path.dirname(os.path.abspath(__file__))
PARTS = os.path.join(HERE, "_render_parts")      # assembled orientation (written by models.py)
OUT = os.path.join(HERE, "..", "drawings")
scene = json.load(open(os.path.join(HERE, "..", "stl", "scene.json")))
P = scene["params"]

INK = "#2b2c30"
SEA = "#2f7fb5"
TAN = "#e9801e"
CREAM = "#fbf4e8"
FILL = "#e9e2d4"
SEC = "#f3c99a"
A3 = (420.0, 297.0)
plt.rcParams["font.family"] = "DejaVu Sans"


def load(name):
    return trimesh.load(os.path.join(PARTS, name + ".stl"))


AX = {"top": (0, 1), "front": (0, 2), "side": (1, 2)}


def silhouette(mesh, view):
    i, j = AX[view]
    tris = mesh.vertices[mesh.faces][:, :, [i, j]]
    polys = []
    for t in tris:
        p = Polygon(t)
        if p.area > 1e-6:
            polys.append(p.buffer(1e-4))
    return unary_union(polys)


def section(mesh, axis, value, view):
    normal = np.zeros(3)
    normal[axis] = 1.0
    origin = np.zeros(3)
    origin[axis] = value
    s = mesh.section(plane_origin=origin, plane_normal=normal)
    if s is None:
        return Polygon()
    i, j = AX[view]
    shape = Polygon()
    for line in s.discrete:
        if len(line) < 3:
            continue
        p = Polygon(line[:, [i, j]]).buffer(0)
        shape = shape.symmetric_difference(p)
    return shape


class Sheet:
    def __init__(self, title, subtitle, sheet_no):
        self.fig = plt.figure(figsize=(A3[0] / 25.4, A3[1] / 25.4))
        self.ax = self.fig.add_axes([0, 0, 1, 1])
        self.ax.set_xlim(0, A3[0])
        self.ax.set_ylim(0, A3[1])
        self.ax.set_aspect("equal")
        self.ax.axis("off")
        self.fig.patch.set_facecolor("white")
        a = self.ax
        a.add_patch(Rectangle((8, 8), A3[0] - 16, A3[1] - 16, fill=False, lw=0.9, ec=INK))
        # title block
        x0, y0, w, h = A3[0] - 8 - 150, 8, 150, 36
        a.add_patch(Rectangle((x0, y0), w, h, fill=True, fc=CREAM, lw=0.8, ec=INK))
        a.add_patch(Rectangle((x0, y0), 10, h, fill=True, fc=TAN, lw=0))
        a.text(x0 + 15, y0 + 26, title, fontsize=13, weight="bold", color=INK, va="center")
        a.text(x0 + 15, y0 + 18, subtitle, fontsize=7.5, color=INK, va="center")
        a.text(x0 + 15, y0 + 10, "Jeju wish-band · 2026 GLOBAL UNIFORCE · KMUTNB", fontsize=6.5, color="#666", va="center")
        a.text(x0 + w - 4, y0 + 26, f"Sheet {sheet_no}/2", fontsize=7.5, ha="right", va="center", color=INK)
        a.text(x0 + w - 4, y0 + 18, "Units: mm", fontsize=7, ha="right", va="center", color=INK)
        a.text(x0 + w - 4, y0 + 10, "A3 · print at 100 %", fontsize=6.5, ha="right", va="center", color="#666")

    # --- drawing primitives (all in paper mm) ---------------------------
    def shape(self, geom, ox, oy, s, fc=FILL, ec=INK, lw=0.6, hatch=None, alpha=1):
        geoms = geom.geoms if hasattr(geom, "geoms") else [geom]
        for g in geoms:
            if g.is_empty or not isinstance(g, Polygon):
                continue
            ext = np.asarray(g.exterior.coords) * s + (ox, oy)
            self.ax.fill(ext[:, 0], ext[:, 1], fc=fc, ec="none", alpha=alpha, hatch=hatch, zorder=2)
            self.ax.plot(ext[:, 0], ext[:, 1], color=ec, lw=lw, zorder=3)
            for hole in g.interiors:
                h = np.asarray(hole.coords) * s + (ox, oy)
                self.ax.fill(h[:, 0], h[:, 1], fc="white", ec="none", zorder=2.5)
                self.ax.plot(h[:, 0], h[:, 1], color=ec, lw=lw, zorder=3)

    def lines(self, geom, ox, oy, s, color=INK, lw=0.35, ls="-"):
        geoms = geom.geoms if hasattr(geom, "geoms") else [geom]
        for g in geoms:
            if g.is_empty or not isinstance(g, Polygon):
                continue
            for ring in [g.exterior] + list(g.interiors):
                r = np.asarray(ring.coords) * s + (ox, oy)
                self.ax.plot(r[:, 0], r[:, 1], color=color, lw=lw, ls=ls, zorder=4)

    def label(self, x, y, text, size=8, **kw):
        self.ax.text(x, y, text, fontsize=size, color=kw.pop("color", INK), **kw)

    def view_title(self, x, y, text, scale):
        self.ax.text(x, y + 8, text, fontsize=8.5, weight="bold", color=INK, ha="center")
        self.ax.text(x, y + 4, f"scale {scale}", fontsize=6.5, color="#777", ha="center")

    def dim(self, p1, p2, off, text, s=1.0, ox=0, oy=0, vertical=False, size=7):
        """Linear dimension between model points p1, p2 (model mm) offset `off` paper mm."""
        x1, y1 = p1[0] * s + ox, p1[1] * s + oy
        x2, y2 = p2[0] * s + ox, p2[1] * s + oy
        a = self.ax
        if vertical:
            xd = max(x1, x2) + off if off > 0 else min(x1, x2) + off
            a.plot([x1, xd + math.copysign(1.5, off)], [y1, y1], color=SEA, lw=0.3)
            a.plot([x2, xd + math.copysign(1.5, off)], [y2, y2], color=SEA, lw=0.3)
            a.annotate("", (xd, y1), (xd, y2), arrowprops=dict(arrowstyle="<|-|>", color=SEA, lw=0.5, shrinkA=0, shrinkB=0, mutation_scale=5))
            a.text(xd + (1.2 if off > 0 else -1.2), (y1 + y2) / 2, text, fontsize=size, color=SEA, rotation=90,
                   ha="left" if off > 0 else "right", va="center", rotation_mode="anchor" if False else "default")
        else:
            yd = max(y1, y2) + off if off > 0 else min(y1, y2) + off
            a.plot([x1, x1], [y1, yd + math.copysign(1.5, off)], color=SEA, lw=0.3)
            a.plot([x2, x2], [y2, yd + math.copysign(1.5, off)], color=SEA, lw=0.3)
            a.annotate("", (x1, yd), (x2, yd), arrowprops=dict(arrowstyle="<|-|>", color=SEA, lw=0.5, shrinkA=0, shrinkB=0, mutation_scale=5))
            a.text((x1 + x2) / 2, yd + (1.0 if off > 0 else -1.0), text, fontsize=size, color=SEA,
                   ha="center", va="bottom" if off > 0 else "top")

    def leader(self, xy, txy, text, s=1.0, ox=0, oy=0, size=6.8):
        x, y = xy[0] * s + ox, xy[1] * s + oy
        self.ax.annotate(text, (x, y), (txy[0], txy[1]), fontsize=size, color=SEA,
                         arrowprops=dict(arrowstyle="-|>", color=SEA, lw=0.4, mutation_scale=5),
                         ha="left" if txy[0] >= x else "right", va="center")

    def note_box(self, x, y, w, lines, title=None, size=6.6):
        a = self.ax
        lh = size * 0.62
        h = lh * (len(lines) + (1.6 if title else 0.4)) + 4
        a.add_patch(FancyBboxPatch((x, y - h), w, h, boxstyle="round,pad=0,rounding_size=2", fc=CREAM, ec="#d8cbb4", lw=0.5))
        cy = y - 4
        if title:
            a.text(x + 3, cy, title, fontsize=size + 1, weight="bold", color=INK, va="top")
            cy -= lh * 1.6
        for ln in lines:
            a.text(x + 3, cy, ln, fontsize=size, color=INK, va="top", family="DejaVu Sans")
            cy -= lh
        return y - h


def sheet_admin(pdf):
    sh = Sheet("Admin desk unit", "Sloped shell + bottom plate for ESP32 + PN532", 1)
    a = sh.ax
    s = 1.0
    shell, plate = load("admin_shell"), load("admin_bottom_plate")
    W, D, t = P["adm_w"], P["adm_d"], P["wall"]
    sl = math.radians(P["adm_slope"])
    k = math.tan(sl)
    hf = P["adm_front_h"]
    hr = hf + k * D
    T = P["adm_plate_t"]
    u0, v0 = P["adm_reader_u"], P["adm_reader_v"]

    # 1. view square to the sloped top
    top = shell.copy()
    top.apply_transform(trimesh.transformations.rotation_matrix(-sl, (1, 0, 0)))
    a_, k_, z0_ = math.radians(P["adm_slope"]), k, hf + k * D / 2
    zt = z0_ * math.cos(sl)          # the sloped top surface, now level
    ox, oy = 92, 194
    sh.shape(silhouette(top, "top"), ox, oy, s, fc="#fde3c4")
    sh.lines(section(top, 2, zt - 0.6, "top"), ox, oy, s, lw=0.35)
    sh.lines(section(top, 2, zt + 0.3, "top"), ox, oy, s, lw=0.35)
    sh.view_title(ox, 266, "Shell, view square to the sloped top", "1:1")
    yb = float(top.bounds[0][1])
    ytp = float(top.bounds[1][1])
    sh.dim((-W / 2, ytp), (W / 2, ytp), 6, f"{W:.0f}", s, ox, oy)
    sh.dim((W / 2, yb), (W / 2, ytp), 6, f"{ytp - yb:.1f} along the slope", s, ox, oy, vertical=True)
    ym = (yb + ytp) / 2
    sh.dim((u0 - P["tray_d"] / 2, yb), (u0 + P["tray_d"] / 2, yb), -6,
           f"wristband tray Ø{P['tray_d']:.0f}, {P['tray_depth']} deep", s, ox, oy)
    sh.leader((36, ym - 22), (ox + W / 2 + 12, oy - 34), f"buzzer grille (Ø{P['buzzer_d']:.0f})", s, ox, oy)
    sh.leader((36, ym + 18), (ox + W / 2 + 12, oy + 30), f"LED window Ø{P['led_d'] + 0.3:.1f}", s, ox, oy)
    sh.leader((u0 - 10, ym + v0 - P["tray_d"] / 2 - 2.2), (ox - W / 2 - 8, oy - 36), "band stop lip", s, ox, oy)

    # 2. right side view with section A-A through the tray centre
    ox, oy = 92, 62
    sh.shape(silhouette(shell, "side"), ox, oy + T, s, fc="#fde3c4")
    sh.shape(section(shell, 0, u0, "side"), ox, oy + T, s, fc=SEC, hatch="\\\\\\\\")
    sh.shape(silhouette(plate, "side"), ox, oy + T, s, fc="#bdbab3")
    sh.view_title(ox, 128, "Side view + section A-A (through the tray)", "1:1")
    sh.dim((-D / 2, -T), (-D / 2, hf), -6, f"{hf + T:.1f}", s, ox, oy + T, vertical=True)
    sh.dim((D / 2, -T), (D / 2, hr), 6, f"{hr + T:.1f}", s, ox, oy + T, vertical=True)
    sh.dim((-D / 2, -T), (D / 2, -T), -6, f"{D:.0f}", s, ox, oy + T)
    a.text(ox - D / 2 + 22, oy + T + hf + 6, f"{P['adm_slope']:.0f}°", fontsize=8, color=SEA)
    a.plot([ox - D / 2 + 4, ox - D / 2 + 34], [oy + T + hf + 1.3, oy + T + hf + 1.3], color=SEA, lw=0.3)
    yv = v0 * math.cos(sl)
    sh.leader((yv, hf + k * (D / 2 + yv) - t - 1), (ox + D / 2 + 12, oy + 52),
              f"PN532 under the {t:.1f} mm top;\nreads through {t - P['tray_depth']:.1f} mm at the tray", s, ox, oy + T)
    sh.leader((D / 2 - t / 2, P["esp32_lift"] + 2.8), (ox + D / 2 + 12, oy + 22), "USB cable opening\n(rear wall)", s, ox, oy + T)

    # 3. bottom plate, section at 4 mm (top view)
    ox, oy = 268, 208
    sh.shape(silhouette(plate, "top"), ox, oy, s, fc="#f1eee8")
    sh.shape(section(plate, 2, 4.0, "top"), ox, oy, s, fc="#bdbab3", hatch="////")
    sh.view_title(ox, 266, "Bottom plate, section at 4 mm", "1:1")
    sh.dim((-W / 2, D / 2), (W / 2, D / 2), 6, f"{W:.0f}", s, ox, oy)
    sh.dim((W / 2, -D / 2), (W / 2, D / 2), 6, f"{D:.0f}", s, ox, oy, vertical=True)
    bx, by = W / 2 - 7, D / 2 - 7
    sh.dim((-bx, -D / 2), (bx, -D / 2), -6, f"M3 holes {2 * bx:.0f} × {2 * by:.0f} c/c, countersunk from below", s, ox, oy)
    sh.leader((P["adm_esp32_x"] + 10, D / 2 - 6), (ox + W / 2 + 12, oy + 30), "ESP32 cradle,\nUSB to the rear", s, ox, oy)
    sh.leader((-W / 2 + t + 1.5, 0), (ox - W / 2 - 8, oy + 10), "locating skirt 3 high", s, ox, oy)

    # 4. rear view (USB opening)
    ox, oy = 268, 74
    rear = section(shell, 1, D / 2 - 1.0, "front")
    sh.shape(silhouette(shell, "front"), ox, oy + T, s, fc="#fde3c4")
    sh.shape(rear, ox, oy + T, s, fc=SEC, hatch="\\\\\\\\")
    sh.shape(silhouette(plate, "front"), ox, oy + T, s, fc="#bdbab3")
    sh.view_title(ox, 140, "Rear view (section just inside the back wall)", "1:1")
    uw, uh = P["usb_cut"]
    uz = P["esp32_lift"] + 1.6 + 1.2
    ux = P["adm_esp32_x"]
    sh.dim((ux - uw / 2, uz - uh / 2), (ux + uw / 2, uz - uh / 2), -8, f"{uw:.0f}", s, ox, oy + T)
    sh.leader((ux, uz), (ox + W / 2 + 8, oy + 40), f"USB opening {uw:.0f} × {uh:.0f}\ncentre {uz + T:.1f} above table", s, ox, oy + T)

    sh.note_box(14, 46, 120, [
        "ESP32 DevKitC V4   54.4 × 27.9 mm, pins down",
        "PN532 V3 board     42.7 × 40.4 mm, I2C (SDA 21, SCL 22)",
        "Buzzer             Ø12 × 9.5 mm, GPIO 4",
        "LED                5 mm, GPIO 2",
        "Screws             M3 × 10 self-tapping, countersunk ×4",
        "Feet               Ø10 rubber bumpers ×4",
    ], "Components (sizes assumed, check yours)")
    sh.note_box(138, 46, 120, [
        "Shell: tangerine PLA/PETG. The STL lies on its",
        "sloped top, so it prints with no supports.",
        "Plate: basalt grey, flat side down.",
        "0.2 mm layers, 3 walls, 15–20 % infill.",
        "PN532: foam tape in the frame under the tray.",
    ], "Printing and assembly")
    pdf.savefig(sh.fig)
    sh.fig.savefig(os.path.join(OUT, "sheet1-admin-desk-unit.png"), dpi=200)
    plt.close(sh.fig)


def sheet_station(pdf):
    sh = Sheet("Check-in station", "Food / place / activity · base + lid for ESP32 + RC522", 2)
    a = sh.ax
    s = 1.0
    base, lid = load("station_base"), load("station_lid")
    W, D, H, T = P["box_w"], P["box_d"], P["box_h"], P["lid_t"]
    f = P["floor"]

    # 1. base, section at z = 8 (top view)
    ox, oy = 100, 220
    sh.shape(silhouette(base, "top"), ox, oy, s, fc="#f1eee8")
    sh.shape(section(base, 2, 8.0, "top"), ox, oy, s, fc="#bdbab3", hatch="////")
    sh.view_title(ox, 268, "Base, section at 8 mm (top view)", "1:1")
    sh.dim((-W / 2, D / 2), (W / 2, D / 2), 6, f"{W:.0f}", s, ox, oy)
    sh.dim((W / 2, -D / 2), (W / 2, D / 2), 6, f"{D:.0f}", s, ox, oy, vertical=True)
    bx, by = W / 2 - 7, D / 2 - 7
    sh.leader((bx, -by), (ox + W / 2 + 10, oy - 30), f"screw bosses ×4, Ø8\n{2 * bx:.0f} × {2 * by:.0f} c/c, pilot Ø{P['screw_pilot_d']}", s, ox, oy)
    sh.leader((-W / 2 + 6, 10), (ox - W / 2 - 6, oy + 30), "ESP32 cradle\n(USB end at wall)", s, ox, oy)
    sh.leader((-W / 2 + P['wall'] / 2, -10), (ox - W / 2 - 6, oy - 20), f"wall {P['wall']}", s, ox, oy)

    # 2. base, section B-B (y = 0, front)
    ox, oy = 100, 120
    sh.shape(silhouette(base, "front"), ox, oy, s, fc="#f1eee8")
    sh.shape(section(base, 1, 0.0, "front"), ox, oy, s, fc="#bdbab3", hatch="////")
    sh.view_title(ox, 168, "Base, section B-B (front)", "1:1")
    sh.dim((-W / 2, 0), (-W / 2, H), -6, f"{H:.0f}", s, ox, oy, vertical=True)
    sh.dim((W / 2, 0), (W / 2, f), 6, f"floor {f}", s, ox, oy, vertical=True)
    lift = P["esp32_lift"]
    sh.leader((-20, f + lift / 2), (ox + 6, oy + 22), f"board sits {lift:.0f} above the floor\n(header pins hang free)", s, ox, oy)
    uw, uh = P["usb_cut"]
    uz = f + lift + 1.6 + 1.2
    sh.leader((-W / 2, uz), (ox - W / 2 - 6, oy + 34), f"USB opening {uw:.0f} × {uh:.0f}\ncentre {uz:.1f} above base", s, ox, oy)
    sh.leader((W / 2 - 0.4, 19), (ox + W / 2 + 6, oy + 26), "3 sea-wave grooves\n0.9 wide, 0.6 deep", s, ox, oy)

    # 3. base, left side view with USB opening (section just inside the left wall)
    ox, oy = 100, 32
    side = section(base, 0, -W / 2 + 1.2, "side")
    sh.shape(silhouette(base, "side"), ox, oy, s, fc="#f1eee8")
    sh.shape(side, ox, oy, s, fc="#bdbab3", hatch="////")
    sh.view_title(ox, 80, "Base, left side (USB end)", "1:1")
    sh.dim((-uw / 2, uz - uh / 2), (uw / 2, uz - uh / 2), -8, f"{uw:.0f}", s, ox, oy)
    sh.dim((-uw / 2, uz - uh / 2), (-uw / 2, uz + uh / 2), -8, f"{uh:.0f}", s, ox, oy, vertical=True)
    sh.dim((D / 2, 0), (D / 2, H), 6, f"{H:.0f}", s, ox, oy, vertical=True)

    # 4. lid top view
    ox, oy = 262, 220
    sh.shape(silhouette(lid, "top"), ox, oy, s, fc="#fbf7ef")
    sh.lines(section(lid, 2, T - P["tap_depth"] * 0.5, "top"), ox, oy, s, color=INK, lw=0.35)
    sh.lines(section(lid, 2, T + 0.3, "top"), ox, oy, s, color=INK, lw=0.35)
    sh.view_title(ox, 268, "Lid, top view", "1:1")
    tx = P["tap_x"]
    sh.dim((tx - P["tap_d"] / 2, D / 2), (tx + P["tap_d"] / 2, D / 2), 6, f"tap zone Ø{P['tap_d']:.0f}, {P['tap_depth']} deep", s, ox, oy)
    sh.dim((W / 2, -D / 2), (W / 2, D / 2), 6, f"{D:.0f}", s, ox, oy, vertical=True)
    sh.dim((-W / 2, -D / 2), (tx, -D / 2), -6, f"{W / 2 + tx:.0f}", s, ox, oy)
    sh.leader((31, -20), (ox + W / 2 + 4, oy - 30), f"buzzer grille\n(Ø{P['buzzer_d']:.0f} buzzer)", s, ox, oy)
    sh.leader((31, 20), (ox + W / 2 + 4, oy + 30), f"LED window Ø{P['led_d'] + 0.3:.1f}", s, ox, oy)
    sh.leader((-W / 2 + 7, D / 2 - 7), (ox - W / 2 - 4, oy + 46), "M3 countersunk ×4", s, ox, oy)

    # 5. lid section C-C (y = 0)
    ox, oy = 262, 136
    sh.shape(section(lid, 1, 0.0, "front"), ox, oy, s, fc=SEC, hatch="\\\\\\\\")
    rw, rd = P["rc522"]
    rx0 = P["reader_x"]
    a.add_patch(Rectangle((ox + (rx0 - rw / 2) * s, oy - 1.6 * s), rw * s, 1.6 * s, fc="#2f5fb5", ec=INK, lw=0.4, zorder=5))
    sh.view_title(ox, 152, "Lid, section C-C with RC522", "1:1")
    sh.dim((W / 2, 0), (W / 2, T), 8, f"{T:.0f}", s, ox, oy, vertical=True)
    sh.dim((rx0 - rw / 2, -1.6), (rx0 + rw / 2, -1.6), -8, f"reader frame {rw + 0.6:.1f} × {rd + 0.6:.1f}", s, ox, oy)
    sh.leader((tx, T - P["tap_depth"]), (ox + 22, oy + 18), f"read through {T - P['tap_depth']:.1f} mm", s, ox, oy)
    sh.leader((-W / 2 + 4, -2), (ox - W / 2 - 4, oy - 10), "locating skirt 4 deep", s, ox, oy)

    # notes
    y = sh.note_box(162, 106, 112, [
        "ESP32 DevKitC V4   54.4 × 27.9 mm, pins down",
        "RC522 board        60 × 40 mm (food / place / activity)",
        "PN532 V3 board     42.7 × 40.4 mm (admin desk)",
        "Buzzer             Ø12 × 9.5 mm, GPIO 4",
        "LED                5 mm, GPIO 2",
        "Screws             M3 × 8 self-tapping, countersunk ×4",
        "Feet               Ø10 rubber bumpers ×4",
    ], "Components (sizes assumed, check yours)")
    sh.note_box(280, 106, 130, [
        "Base  PLA/PETG basalt grey, open side up, no supports",
        "      (USB opening bridges 12 mm).",
        "Lid   PLA/PETG cream, flat top on the bed (STL is",
        "      already flipped), supports off.",
        "0.2 mm layers, 3 walls, 15–20 % infill.",
        "Reader: stick the RC522 in the frame with foam tape,",
        "antenna end under the tap circle; same frame takes",
        "the PN532 for the admin desk.",
    ], "Printing and assembly")
    pdf.savefig(sh.fig)
    sh.fig.savefig(os.path.join(OUT, "sheet2-checkin-station.png"), dpi=200)
    plt.close(sh.fig)


def main():
    os.makedirs(OUT, exist_ok=True)
    with PdfPages(os.path.join(OUT, "jeju-wish-band-device-drawings.pdf")) as pdf:
        sheet_admin(pdf)
        sheet_station(pdf)
    print("wrote", OUT)


if __name__ == "__main__":
    main()
