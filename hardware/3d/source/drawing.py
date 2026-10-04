"""
Dimensioned drawings for the Jeju wish-band 3D parts.
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


def sheet_wristband(pdf):
    sh = Sheet("Wristband", "Hallabong NFC charm · basalt beads · UV bead", 1)
    a = sh.ax
    s = 2.0
    base, cap = load("wristband_charm_base"), load("wristband_charm_cap")
    cap.apply_translation((0, 0, P["charm_base_h"]))
    bead, uvb = load("wristband_basalt_bead"), load("wristband_uv_bead")
    R = P["charm_d"] / 2

    # 1. charm top view
    ox, oy = 62, 212
    sh.shape(silhouette(base, "top"), ox, oy, s, fc="#d9d6d0")
    sh.shape(silhouette(cap, "top"), ox, oy, s, fc="#f9d4ab")
    sh.view_title(ox, 268, "Charm, top view", "2:1")
    sh.dim((-R, 0), (R, 0), -R * s - 8, f"Ø{P['charm_d']:.0f}", s, ox, oy)
    capR = R - P["charm_rim_w"] - P["fit_clearance"]
    sh.dim((-capR, 0), (capR, 0), capR * s + 2 - 0 + 6, f"Ø{2 * capR:.1f} cap", s, ox, oy)
    sh.leader((R - 0.5, -6), (ox + R * s + 6, oy - 22), "cord channel\nexits both sides", s, ox, oy)

    # 2. charm section A-A (XZ through centre)
    ox, oy = 172, 196
    sec_b = section(base, 1, 0.0, "front")
    sec_c = section(cap, 1, 0.0, "front")
    sh.shape(sec_b, ox, oy, s, fc="#bdbab3", hatch="////")
    sh.shape(sec_c, ox, oy, s, fc=SEC, hatch="\\\\\\\\")
    # NFC tag in its pocket
    tz = P["charm_base_h"] - P["tag_t"] - 0.4
    a.add_patch(Rectangle((ox - P["tag_d"] / 2 * s, oy + tz * s), P["tag_d"] * s, P["tag_t"] * s, fc=SEA, ec=INK, lw=0.4, zorder=5))
    sh.view_title(ox, 268, "Charm assembly, section A-A", "2:1")
    sh.dim((-R, 0), (-R, P["charm_base_h"]), -10, f"{P['charm_base_h']:.1f}", s, ox, oy, vertical=True)
    top = float(cap.bounds[1][2])
    sh.dim((R, 0), (R, top), 6, f"{top:.1f} overall", s, ox, oy, vertical=True)
    sh.dim((-P["tag_d"] / 2 - 0.3, 0), (P["tag_d"] / 2 + 0.3, 0), -12, f"tag pocket Ø{P['tag_d'] + 0.6:.1f} × {P['tag_t'] + 0.4:.1f} deep", s, ox, oy)
    sh.leader((-R + 3, 2.2), (ox - R * s - 10, oy - 22), f"cord channel Ø{P['channel_d']}", s, ox, oy)
    sh.leader((6, tz + 0.5), (ox + R * s + 16, oy + 30), f"NTAG215 Ø{P['tag_d']:.0f} × {P['tag_t']:.0f}", s, ox, oy)
    sh.leader((R - 0.6, P["charm_base_h"] + 1.0), (ox + R * s + 16, oy + 14), f"rim {P['charm_rim_h']} high,\ncap press-fit + glue", s, ox, oy)

    # 3. cap front view
    ox, oy = 300, 206
    sh.shape(silhouette(cap.copy().apply_translation((0, 0, -P["charm_base_h"])), "front"), ox, oy, s, fc="#f9d4ab")
    sh.view_title(ox, 268, "Cap, front view", "2:1")
    ch = float(cap.bounds[1][2] - cap.bounds[0][2])
    sh.dim((capR, 0), (capR, ch), 8, f"{ch:.1f}", s, ox, oy, vertical=True)
    sh.leader((0, ch - 0.5), (ox - 40, oy + ch * s + 8), "Hallabong knot, stem and leaf", s, ox, oy)

    # 4. beads (section through hole axis)
    for i, (m, name, d, txt) in enumerate([(bead, "Basalt bead", P["bead_d"], "dark grey / black PLA"),
                                          (uvb, "UV bead", P["uv_bead_d"], "UV colour-change filament")]):
        ox, oy = 368 + i * 0, 228 - i * 48
        sh.shape(section(m, 1, 0.0, "front"), ox, oy, s, fc="#bdbab3" if i == 0 else "#f3efe8", hatch="////")
        hgt = float(m.bounds[1][2] - m.bounds[0][2])
        sh.dim((-d / 2, 0), (d / 2, 0), -6, f"Ø{d:.0f}", s, ox, oy)
        sh.dim((d / 2, 0), (d / 2, hgt), 5, f"{hgt:.1f}", s, ox, oy, vertical=True)
        sh.label(ox, oy + hgt * s + 4, f"{name}, section", 8, ha="center", weight="bold")
        sh.label(ox, oy - 17, f"hole Ø{P['cord_hole_d']:.1f} · {txt}", 6.2, ha="center", color="#555")

    # 5. bracelet layout (1:1, schematic)
    ox, oy, s1 = 80, 92, 1.0
    L = scene["bracelet"]["M"]
    Rc = L["centre_radius"]
    a.add_patch(Circle((ox, oy), Rc, fill=False, ec="#999", lw=0.3, ls=(0, (4, 2))))
    for kind, th in L["items"]:
        cx, cy = ox + Rc * math.cos(th), oy + Rc * math.sin(th)
        if kind == "charm":
            w, h = P["charm_d"], P["charm_base_h"] + 9
            h = float(scene["parts"]["wristband_charm_base"]["size_mm"][2]) + float(scene["parts"]["wristband_charm_cap"]["size_mm"][2]) - P["charm_rim_h"]
            cx, cy = ox + (Rc - P["bead_d"] / 2) * math.cos(th), oy + (Rc - P["bead_d"] / 2) * math.sin(th)
            t = Rectangle((cx, cy - w / 2), h, w, fc="#f9d4ab", ec=INK, lw=0.5)
            from matplotlib.transforms import Affine2D
            t.set_transform(Affine2D().rotate_around(cx, cy, th) + a.transData)
            a.add_patch(t)
        else:
            d = P["uv_bead_d"] if kind == "uv" else P["bead_d"]
            a.add_patch(Circle((cx, cy), d / 2, fc="#f3efe8" if kind == "uv" else "#3a3b40", ec=INK, lw=0.4))
    inner = Rc - P["bead_d"] / 2
    a.add_patch(Circle((ox, oy), inner, fill=False, ec=TAN, lw=0.6))
    sh.dim((-inner, 0), (inner, 0), -inner - 12, f"inner Ø{2 * inner:.1f} (wrist {scene['params']['wrist_sizes']['M']} mm)", 1, ox, oy)
    sh.view_title(ox, 148, "Bracelet layout, size M (top view)", "1:1")
    sh.label(ox - 52, oy + 40, "charm faces out,\nflat base on the wrist", 6.2, color="#555")

    # sizes + BOM + print notes
    rows = []
    for k, v in scene["bracelet"].items():
        rows.append(f"{k}: wrist {P['wrist_sizes'][k]} mm  →  {v['basalt_beads']} basalt beads + 1 UV bead + charm")
    y = sh.note_box(150, 150, 120, rows + ["Elastic cord Ø1.0 mm clear, about 25 cm per band;", "surgeon's knot hidden inside the charm channel."], "Sizes (elastic stretch fit)")
    sh.note_box(150, y - 4, 120, [
        "Charm base   PLA basalt grey   0.12 mm layers, 100 % infill",
        "Charm cap    PLA tangerine     flat side down; supports off",
        "Basalt bead  PLA black/stone   hole vertical, 20 % infill",
        "UV bead      UV colour-change PLA (white → colour in sun)",
        "NFC tag      NTAG215 Ø25 mm sticker, placed before the cap",
        "Glue         a drop of CA glue on the rim before pressing cap",
    ], "Parts and printing")
    sh.note_box(278, 150, 134, [
        "• Tag Ø25 × 1.0 mm (common NTAG215 coin sticker).",
        "• Read distance through the 1.5 mm cap floor: the tag",
        "  faces the reader when the charm is tapped face-down.",
        "• Pocket and rim gaps 0.2–0.3 mm per side; tune",
        "  `fit_clearance` in models.py for your printer.",
        "• The beads are copies of one STL: print 13 / 15 / 16.",
        "• Real volcanic basalt beads (10 mm, Ø2 hole) can",
        "  replace the printed ones with no other change.",
    ], "Assumptions")
    pdf.savefig(sh.fig)
    sh.fig.savefig(os.path.join(OUT, "sheet1-wristband.png"), dpi=200)
    plt.close(sh.fig)


def sheet_station(pdf):
    sh = Sheet("Check-in station", "Enclosure base + lid for ESP32 + RC522 / PN532", 2)
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
    sh.fig.savefig(os.path.join(OUT, "sheet2-station.png"), dpi=200)
    plt.close(sh.fig)


def main():
    os.makedirs(OUT, exist_ok=True)
    with PdfPages(os.path.join(OUT, "jeju-wish-band-3d-drawings.pdf")) as pdf:
        sheet_wristband(pdf)
        sheet_station(pdf)
    print("wrote", OUT)


if __name__ == "__main__":
    main()
