from PIL import Image, ImageDraw, ImageFont, ImageChops
BG=(251,244,232); INK=(43,44,48); TAN=(233,128,30); SEA=(47,127,181)
F='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'; FB='/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
def font(sz,b=False): return ImageFont.truetype(FB if b else F, sz)
def crop(p,pad=30):
    im=Image.open(p).convert('RGB'); diff=ImageChops.difference(im,Image.new('RGB',im.size,BG)).convert('L').point(lambda v:255 if v>6 else 0)
    x0,y0,x1,y1=diff.getbbox(); return im.crop((max(0,x0-pad),max(0,y0-pad),min(im.width,x1+pad),min(im.height,y1+pad)))
def fit(im,w,h):
    r=min(w/im.width,h/im.height); return im.resize((int(im.width*r),int(im.height*r)),Image.LANCZOS)
W,H=3000,2000
c=Image.new('RGB',(W,H),BG); d=ImageDraw.Draw(c)
d.rectangle((0,0,W,150),fill=INK); d.rectangle((0,150,W,162),fill=TAN)
d.text((70,38),"Jeju wish-band",font=font(64,True),fill=(251,244,232))
d.text((640,58),"3D design overview  ·  smart basalt bracelet + check-in station",font=font(38),fill=(240,215,180))
d.text((W-70,62),"2026 GLOBAL UNIFORCE · KMUTNB",font=font(28),fill=(200,200,200),anchor='ra')
def card(box,img,title,sub):
    x0,y0,x1,y1=box
    d.rounded_rectangle(box,radius=28,fill=BG,outline=(225,212,190),width=3)
    d.text((x0+36,y0+28),title,font=font(36,True),fill=INK)
    d.text((x0+36,y0+76),sub,font=font(25),fill=(110,110,110))
    im=fit(img,x1-x0-60,y1-y0-150); c.paste(im,(x0+(x1-x0-im.width)//2,y0+125+(y1-y0-150-im.height)//2))
card((60,200,1760,1250),crop('out_hero.png'),"Tap to check in","Tourist taps the Hallabong charm on any station: stamp, beep, LED; no app install")
card((1800,200,2940,720),crop('out_charm.png'),"Hallabong NFC charm","Ø34 mm · NTAG215 Ø25 tag sealed under the cap")
# bracelet pair
pair=Image.new('RGB',(3300,1000),BG); a=crop('out_bracelet.png'); b=crop('out_bracelet_uv1.png')
a=fit(a,1600,1000); b=fit(b,1600,1000); pair.paste(a,(0,(1000-a.height)//2)); pair.paste(b,(1700,(1000-b.height)//2))
card((1800,760,2940,1250),pair,"UV bead: shade vs. sun","Pearl white indoors, tangerine in strong UV (zero power)")
card((60,1290,1300,1940),crop('out_exploded.png'),"Check-in station","100 × 76 × 43 mm · ESP32 + RC522/PN532 + buzzer + LED")
x0,y0=1340,1290
d.rounded_rectangle((x0,y0,2940,1940),radius=28,fill=BG,outline=(225,212,190),width=3)
d.text((x0+40,y0+30),"Printable parts",font=font(36,True),fill=INK)
rows=[("Charm base","basalt grey PLA","34 × 34 × 7.5"),("Charm cap","tangerine PLA","31.6 × 31.6 × 13.3"),
("Basalt bead ×15 (M)","black / stone PLA","Ø10 × 8.4"),("UV bead","UV colour-change PLA","Ø12 × 10.4"),
("Station base","basalt grey PLA/PETG","100 × 76 × 40"),("Station lid","cream PLA/PETG","100 × 76 × 3 (+ skirt)")]
y=y0+100
d.text((x0+40,y),"Part",font=font(24,True),fill=SEA); d.text((x0+520,y),"Material",font=font(24,True),fill=SEA); d.text((x0+1020,y),"Size (mm)",font=font(24,True),fill=SEA)
y+=44
for r in rows:
    d.line((x0+40,y-8,2900,y-8),fill=(230,220,200),width=2)
    d.text((x0+40,y),r[0],font=font(28),fill=INK); d.text((x0+520,y),r[1],font=font(28),fill=INK); d.text((x0+1020,y),r[2],font=font(28),fill=INK); y+=54
y+=20
for t in ["Wrist sizes: S 150 mm = 13 beads · M 165 mm = 15 · L 180 mm = 16 (elastic Ø1 mm cord).",
          "Swatches: tangerine #F28A22 · basalt #34363B · cream #F4EAD8 · sea blue #2F7FB5.",
          "Files: stl/ (print-ready), drawings/ (A3 dimensioned PDF), source/ (parametric Python)."]:
    d.text((x0+40,y),t,font=font(24),fill=(90,90,90)); y+=40
c.save('../renders/jeju-wish-band-3d-overview.png')
