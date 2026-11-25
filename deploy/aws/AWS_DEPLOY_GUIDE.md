# 🚀 GITEGO KIDS WORLD — AWS EC2 Free Tier Deployment Guide

Iyi nyandiko irakwereka intambwe ku ntambwe uko ushyira **GITEGO KIDS WORLD** kuri **AWS EC2 Free Tier** (kubuntu) ukoresheje Visa card yawe, ntuzigera ucibwa amafaranga utabizi.

---

## Intambwe 1: Fungura Konti ya AWS + Shyiraho Billing Alarm ($1)

1. Jya kuri **https://aws.amazon.com/free/** ukande **Create a Free Account** ukoresheje Email na Visa card yawe.
2. Numara kwinjira muri AWS Console, shaka **Billing and Cost Management** → **Budgets** → **Create budget**:
   - Hitamo **Zero spend budget** (cyangwa limit ya **$1.00**).
   - Shyiramo email yawe kugira ngo AWS ihite ikumenyesha igihe icyo ari cyo cyose igiciro cyaba kigiye kurenga \$0.

---

## Intambwe 2: Fungura Server ya EC2 (Free Tier)

1. Muri AWS Console, shaka **EC2** → kanda **Launch Instance**.
2. **Name:** `gitego-kids-world`
3. **AMI (OS):** Hitamo **Ubuntu Server 24.04 LTS** *(Free tier eligible)*.
4. **Instance type:** Hitamo **`t2.micro`** cyangwa **`t3.micro`** *(Free tier eligible)*.
5. **Key pair (login):** Kanda **Create new key pair** → izina `gitego-key` → `.pem` → bibike kuri mudasobwa yawe (`~/Downloads/gitego-key.pem`).
6. **Network settings (Firewall / Security Group):** Emeza izi ports 3 gusa:
   - ✅ Allow **SSH** (Port `22`)
   - ✅ Allow **HTTP** (Port `80`)
   - ✅ Allow **HTTPS** (Port `443`)
7. **Storage:** `20 GB` gp3 *(Free Tier yemera kugeza kuri 30 GB kubuntu)*.
8. Kanda **Launch Instance** maze utegereze amasegonda 30, ubone **Public IPv4 address** yayo (urugero: `54.123.45.67`).

---

## Intambwe 3: Ohereza Project kuri EC2 ukore Deploy (Command 1 gusa!)

Kuri mudasobwa yawe (Linux terminal), shyiramo IP ya EC2 yawe:

```bash
chmod 400 ~/Downloads/gitego-key.pem

# Ohereza project kuri EC2 (udashyizemo cache)
rsync -avz --exclude 'node_modules' --exclude '__pycache__' --exclude '.pytest_cache' \
  -e "ssh -i ~/Downloads/gitego-key.pem" \
  /home/gitego/Downloads/projects/children-project/ \
  ubuntu@YOUR_EC2_PUBLIC_IP:~/children-project/

# Injira kuri EC2 ukore setup & deploy
ssh -i ~/Downloads/gitego-key.pem ubuntu@YOUR_EC2_PUBLIC_IP \
  "cd ~/children-project && bash deploy/aws/setup-ec2.sh"
```

Mu minota ~3, website yawe izahita ifunguka kuri:
- **`http://YOUR_EC2_PUBLIC_IP/`**

---

## Intambwe 4: Gushyiraho Domain Name + HTTPS y'Ubuntu (Nyuma)

Igihe uzagura domain (urugero `gitegokids.com`):
1. Muri DNS ya domain yawe, shyiraho **A Record** yerekeza kuri `YOUR_EC2_PUBLIC_IP`.
2. Kuri EC2, hindura umurongo umwe muri `~/children-project/.env`:
   ```env
   SITE_ADDRESS=gitegokids.com
   ```
3. Kongera gutangiza Caddy:
   ```bash
   cd ~/children-project
   sudo docker compose --env-file .env -f deploy/aws/docker-compose.aws.yml up -d
   ```
   **Caddy** izahita igukorera **HTTPS SSL Certificate kubuntu** (Let's Encrypt) kandi ikajya yivugurura yonyine!

---

## 🔒 Icyitonderwa cy'Umutekano nyuma yo gu-host
1. Injira nka Super Admin (`admin@gitego.kids` / `Admin123!`).
2. Jya muri **👥 Users / Parents / Children → Admins → 🔐 Set Password** uhindure password ya `admin@gitego.kids` na `creator@gitego.kids`.
