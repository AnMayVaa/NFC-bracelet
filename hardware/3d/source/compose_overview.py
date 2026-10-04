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
d.text((640,58),"3D design overview  ·  admin desk unit + check-in station",font=font(38),fill=(240,215,180))
d.text((W-70,62),"2026 GLOBAL UNIFORCE · KMUTNB",font=font(28),fill=(200,200,200),anchor='ra')
def card(box,img,title,sub):
    x0,y0,x1,y1=box
    d.rounded_rectangle(box,radius=28,fill=BG,outline=(225,212,190),width=3)
    d.text((x0+36,y0+28),title,font=font(36,True),fill=INK)
    d.text((x0+36,y0+76),sub,font=font(25),fill=(110,110,110))
    im=fit(img,x1-x0-60,y1-y0-150); c.paste(im,(x0+(x1-x0-im.width)//2,y0+125+(y1-y0-150-im.height)//2))
card((60,200,1760,1250),crop('out_family.png'),"Two devices, one family","Tangerine admin desk unit (left) and basalt check-in station (right)")
card((1800,200,2940,720),crop('out_admin_exploded.png'),"Admin desk unit","110 × 90 × 55.6 mm · sloped 18° · ESP32 + PN532")
card((1800,760,2940,1250),crop('out_station_exploded.png'),"Check-in station","100 × 76 × 43 mm · ESP32 + RC522 · food / place / activity")
card((60,1290,1300,1940),crop('out_admin.png'),"Staff register a band on the tray","Charm sits in the Ø50 tray; the lip stops it sliding off")
x0,y0=1340,1290
d.rounded_rectangle((x0,y0,2940,1940),radius=28,fill=BG,outline=(225,212,190),width=3)
d.text((x0+40,y0+30),"Printable parts",font=font(36,True),fill=INK)
rows=[("Admin shell","tangerine PLA/PETG","110 × 90 × 53.2"),("Admin bottom plate","basalt grey PLA/PETG","110 × 90 × 2.4 (+ cradle)"),
("Station base","basalt grey PLA/PETG","100 × 76 × 40"),("Station lid","cream PLA/PETG","100 × 76 × 3 (+ skirt)")]
y=y0+100
d.text((x0+40,y),"Part",font=font(24,True),fill=SEA); d.text((x0+520,y),"Material",font=font(24,True),fill=SEA); d.text((x0+1020,y),"Size (mm)",font=font(24,True),fill=SEA)
y+=44
for r in rows:
    d.line((x0+40,y-8,2900,y-8),fill=(230,220,200),width=2)
    d.text((x0+40,y),r[0],font=font(28),fill=INK); d.text((x0+520,y),r[1],font=font(28),fill=INK); d.text((x0+1020,y),r[2],font=font(28),fill=INK); y+=54
y+=20
for t in ["Both: ESP32 DevKitC, 12 mm buzzer (GPIO 4), 5 mm LED (GPIO 2), 4 × M3 screws, rubber feet.",
          "Admin reads through 1.2 mm at the tray; station reads through 2.2 mm at the tap circle.",
          "The station frame also takes a PN532, so one station print can stand in as an admin unit.",
          "Files: stl/ (print-ready), drawings/ (A3 dimensioned PDF), source/ (parametric Python)."]:
    d.text((x0+40,y),t,font=font(24),fill=(90,90,90)); y+=40
import sys
c.save(sys.argv[1] if len(sys.argv) > 1 else '../renders/jeju-wish-band-devices-overview.png')
