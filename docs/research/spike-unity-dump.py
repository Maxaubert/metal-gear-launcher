import sys, os, UnityPy
out = sys.argv[1]; files = sys.argv[2:]
os.makedirs(out, exist_ok=True)
seen = {}
for f in files:
    try:
        env = UnityPy.load(f)
    except Exception as e:
        print("LOADFAIL", f, e); continue
    for obj in env.objects:
        t = obj.type.name
        if t not in ("Texture2D", "Sprite", "Font", "TextAsset", "AudioClip"):
            continue
        try:
            d = obj.read()
            name = getattr(d, "m_Name", None) or getattr(d, "name", "") or f"obj{obj.path_id}"
            name = "".join(c if c.isalnum() or c in "-_. " else "_" for c in name)
        except Exception as e:
            print("READFAIL", t, f, e); continue
        key = f"{t}:{name}"
        seen[key] = seen.get(key, 0) + 1
        if t == "Texture2D":
            try:
                img = d.image; p = os.path.join(out, f"{name}.png"); n = 1
                while os.path.exists(p): n += 1; p = os.path.join(out, f"{name}_{n}.png")
                img.save(p); print("TEX", name, img.size, os.path.basename(f))
            except Exception as e: print("TEXFAIL", name, e)
        elif t == "Font":
            try:
                data = getattr(d, "m_FontData", None)
                if data:
                    p = os.path.join(out, f"{name}.ttf"); open(p, "wb").write(bytes(data)); print("FONT", name, len(data))
                else: print("FONT(no data)", name)
            except Exception as e: print("FONTFAIL", name, e)
        elif t == "AudioClip":
            try:
                for sn, data in d.samples.items():
                    sn = "".join(c if c.isalnum() or c in "-_. " else "_" for c in sn)
                    open(os.path.join(out, sn), "wb").write(data); print("AUDIO", sn, len(data))
            except Exception as e: print("AUDIOFAIL", name, e)
        elif t == "TextAsset":
            print("TEXT", name, len(d.m_Script) if hasattr(d, "m_Script") else "?")
print("SUMMARY", {k: v for k, v in seen.items() if not k.startswith("Texture2D")} if len(seen) < 60 else f"{len(seen)} distinct")
