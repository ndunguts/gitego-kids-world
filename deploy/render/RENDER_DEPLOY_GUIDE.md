# 🚀 GITEGO KIDS WORLD — Free Hosting Guide (Render.com + Neon PostgreSQL)

Ubu buryo ni **100% Kubuntu (Always Free)**, **ntibusaba Visa card**, kandi bukaguha **HTTPS** mu minota ~5!

---

## Intambwe 1: Shyira Project kuri GitHub

1. Fungura repository nshya kuri **https://github.com/new** (urugero izina: `gitego-kids-world`, Private cyangwa Public).
2. Kuri mudasobwa yawe (muri terminal):

```bash
cd /home/gitego/Downloads/projects/children-project
git init
git add .
git commit -m "Initial Gitego Kids World production release"
git branch -M main
git remote add origin https://github.com/YOUR_GITHUB_USERNAME/gitego-kids-world.git
git push -u origin main
```

---

## Intambwe 2: Fata Free PostgreSQL Database itarangira kuri Neon.tech

1. Jya kuri **https://neon.tech** ufungure konti kubuntu (na GitHub cyangwa Google — nta Visa isaba).
2. Kanda **Create Project** → izina: `gitego-kids-world` → **Create**.
3. Kanda **Connection Details** u-copy **Connection string** (itangira na `postgresql://...` irangira na `?sslmode=require`). Uyibike!

---

## Intambwe 3: Deploy kuri Render.com (Minota 3 gusa!)

1. Jya kuri **https://render.com** ufungure konti kubuntu (na GitHub — nta Visa isaba).
2. Kanda **New +** → **Blueprint** (cyangwa **Web Service**).
3. Hitamo GitHub repository yawe **`gitego-kids-world`** — Render izahita ibona file ya **`render.yaml`** yateguwe!
4. Aho bagusaba **`DATABASE_URL`**, shyiramo (paste) iriya Connection String wakuye kuri **Neon.tech**.
5. Kanda **Apply / Create Web Service**!

Mu minota ~3, website yawe izahita ifunguka ifite HTTPS nka:
- **`https://gitego-kids-world.onrender.com/`**

---

## 🔒 Icyitonderwa nyuma yo gu-deploy
1. Injira nka Super Admin (`admin@gitego.kids` / `Admin123!`).
2. Jya muri **👥 Users / Parents / Children → Admins → 🔐 Set Password** uhindure passwords za demo accounts (`admin@gitego.kids` na `creator@gitego.kids`).
3. Niba ubonye bikora neza nyuma ukifuza ko itajya iruhuka nyuma y'iminota 15, ushobora gufata **Starter Plan (\$7/mo)** kuri Render cyangwa kwimukira kuri **AWS EC2** ukoresheje `deploy/aws/`.
