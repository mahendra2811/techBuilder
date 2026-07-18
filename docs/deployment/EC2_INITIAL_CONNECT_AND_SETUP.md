# EC2 — First Connect & Initial Instance Setup

> **Where this fits:** you've just finished `AWS_SETUP_GUIDE.md` §6–9 — the EC2 instance exists, is "Running", 2/2 status checks passed, and its security group allows 80/443 (public) + 22 (your IP only). This doc covers everything **between "instance exists" and "ready for `PRODUCTION_DEPLOYMENT.md`'s One-time server setup"**: how to actually get a shell on the box, and the OS-level groundwork (updates, swap, basic hardening) the app-specific steps assume is already done. Do this once per instance, right after first boot.
>
> **AMI: Amazon Linux 2023.** (2026-07-15 — superseded the original Ubuntu 24.04 plan once `techbuilder2` was actually launched on Amazon Linux 2023 and adopted as the standing instance. Login user is **`ec2-user`**, package manager is **`dnf`**, not `apt`.) If you're reading this against an older Ubuntu box, the commands below won't match — see the note at the very bottom.

---

## 1 · Connect to the instance

Two ways — use Session Manager unless you have a specific reason to SSH directly.

### Option A — SSM Session Manager (recommended, no open SSH needed)

1. EC2 console → Instances → select your instance → **Connect** → **Session Manager** tab → **Connect**.
2. If the button is greyed out or the session fails immediately, wait 2–3 minutes after launch (the SSM agent needs to register) and retry.
3. You land in a shell as `ssm-user`. Amazon Linux AMIs ship the SSM agent pre-installed and pre-configured — this works out of the box as long as the IAM instance role from `AWS_SETUP_GUIDE.md` §5 is attached.

**Why prefer this:** nothing to leak (no private key file), no inbound SSH rule required at all (you can later remove the port-22 rule from the security group entirely), and every session is logged in CloudTrail/SSM by default.

### Option B — SSH with the `.pem` key pair

Use this if you need `scp`/`rsync` for deploys (the deploy script does use SSH), or prefer a normal terminal workflow.

```bash
# One-time: lock down the downloaded key file — SSH refuses keys that are group/world-readable.
chmod 400 ~/Downloads/techbuilder2-keyPair.pem

# Find the instance's public IP or public DNS:
# EC2 console → Instances → select the instance → Public IPv4 address / Public IPv4 DNS

ssh -i ~/Downloads/techbuilder2-keyPair.pem ec2-user@<EC2_PUBLIC_IP_OR_DNS>
```

- Login user is **`ec2-user`** (Amazon Linux convention — not `ubuntu`, that's the Ubuntu AMI's default and does not apply here).
- Use the **public DNS or public IP** — never the instance ID (`i-0abc...`); that's not a resolvable hostname and will fail with a DNS-resolution error.
- Double-check you're passing the file that actually exists (`ls` first) — a typo'd filename fails silently into a generic "Permission denied (publickey)" rather than a clear "file not found".
- First connection prompts to confirm the host key fingerprint — type `yes`.
- If it hangs instead of connecting: the security group's SSH rule source is probably stale — re-edit it to "My IP" again (it changes if you're on a dynamic/mobile connection).
- Keep the `.pem` file out of the repo and out of any synced folder (iCloud/Dropbox) — it's a permanent credential for root-equivalent access to this box.

### Move your public key in via SSM (optional, so you can stop carrying the `.pem` around)

```bash
# Inside an SSM session:
sudo -u ec2-user mkdir -p /home/ec2-user/.ssh
echo "ssh-ed25519 AAAA...your-public-key... you@laptop" | sudo -u ec2-user tee -a /home/ec2-user/.ssh/authorized_keys
sudo chmod 700 /home/ec2-user/.ssh
sudo chmod 600 /home/ec2-user/.ssh/authorized_keys
```

Now `ssh ec2-user@<EC2_PUBLIC_IP_OR_DNS>` works with your own key too. Keep the original `.pem` as a backup regardless (see `ROLLBACK.md`'s "locked out" recovery path, which assumes it still exists).

---

## 2 · First-login sanity checks

Run these once, right after connecting — confirms what you actually got.

```bash
whoami                      # ssm-user (Option A) or ec2-user (Option B)
uname -m                    # aarch64 = Graviton/ARM64, x86_64 = Intel/AMD — note which; it matters below
cat /etc/os-release          # confirms Amazon Linux 2023 (there is no `lsb_release` on this AMI)
free -h                     # total RAM — confirm it matches what you intended to launch (check the EC2 console's instance-type column if unsure)
df -h /                     # root volume size/free — confirm it matches the size you set at launch
nproc                       # vCPU count
```

There's no fixed "expected" number here the way there would be on a single locked-down instance type — whatever family/size you actually launched, this is just confirming the box matches your own expectation before building on top of it. If `uname -m` says `x86_64`, remember that for later: `PRODUCTION_DEPLOYMENT.md`'s download commands auto-detect architecture, but it's worth knowing which one you're on.

---

## 3 · OS updates

```bash
sudo dnf update -y
```

A fresh AMI is built from a point-in-time image — there are almost always kernel/security patches waiting. Do this before installing anything else so Node/Caddy install against a patched base.

Check whether a reboot is actually needed (rather than rebooting blindly every time):

```bash
sudo dnf install -y dnf-utils   # provides `needs-restarting`, not present by default
sudo needs-restarting -r        # exit code 0 = no reboot needed; non-zero = reboot recommended
```

If it says a reboot is needed:

```bash
sudo reboot
# wait ~30s, then reconnect (§1) and continue
```

---

## 4 · Swap file (recommended on anything under ~2 GB RAM)

Neither `AWS_SETUP_GUIDE.md` nor `PRODUCTION_DEPLOYMENT.md` provisions swap, and the systemd unit's `MemoryMax=` cap (see `deploy/systemd/techbuilder-backend.service`) is deliberately tight relative to total RAM. A small swap file is cheap insurance against the **OOM-killer taking down sshd/SSM itself** during a burst (e.g. `dnf update`, or a heavier one-off command) — it does not change the app's own memory ceiling, which stays governed by `MemoryMax`.

```bash
sudo fallocate -l 1G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# Persist across reboots:
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# Lower swappiness — prefer RAM, only swap under real pressure (good default for a small server):
echo 'vm.swappiness=10' | sudo tee /etc/sysctl.d/99-swappiness.conf
sudo sysctl --system

free -h   # confirm a 1.0G swap line now shows
```

If you provisioned something with 4GB+ RAM you can reasonably skip this — but a 1GB swap file is cheap and recommended regardless.

---

## 5 · Basic host-level firewall (optional — Amazon Linux relies on the security group by default)

The security group already does the real work (only 80/443/22 reach the box at all — see `AWS_SETUP_GUIDE.md` §7). Unlike Ubuntu (which ships `ufw` pre-installed and commonly enabled), **Amazon Linux 2023's base AMI has no host firewall active by default** — AWS's own guidance for EC2 is that the security group is the primary/sufficient boundary, so this step is genuinely optional defense-in-depth, not a gap.

If you want a host-level firewall anyway (e.g. this box will later run other software you don't fully trust):

```bash
sudo dnf install -y firewalld
sudo systemctl enable --now firewalld
sudo firewall-cmd --permanent --add-service=ssh
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --reload
sudo firewall-cmd --list-all
```

⚠️ If you're connected via SSH (Option B) when you enable `firewalld`, confirm `--add-service=ssh` succeeded **before** relying on it — locking yourself out here means falling back to Session Manager (Option A) to fix it, or the `ROLLBACK.md` recovery path if SSM access is also lost.

Most single-developer setups on Amazon Linux skip this entirely and rely on the security group alone — that's a legitimate choice here, not a shortcut.

---

## 6 · Automatic security patching (`dnf-automatic`)

One developer, one box — you won't be logging in daily to run `dnf update`. Let Amazon Linux apply security patches automatically (this is the AL2023/RPM equivalent of Ubuntu's `unattended-upgrades`):

```bash
sudo dnf install -y dnf-automatic

# By default dnf-automatic only DOWNLOADS updates without applying them — flip that:
sudo sed -i 's/^apply_updates = no/apply_updates = yes/' /etc/dnf/automatic.conf

sudo systemctl enable --now dnf-automatic.timer
systemctl list-timers dnf-automatic.timer --no-pager   # confirm it's scheduled
```

This applies all updates on its default daily schedule (not security-only by default — edit `/etc/dnf/automatic.conf`'s `upgrade_type` to `security` if you want to match Ubuntu's more conservative default). It won't auto-reboot — notice the "reboot recommended" result from `needs-restarting -r` (§3) on your next manual login and reboot at a moment you choose.

---

## 7 · Verify SSM agent + systemd baseline (quick confirmation)

```bash
sudo systemctl status amazon-ssm-agent --no-pager | head -5   # active (running) — ships pre-installed on Amazon Linux AMIs
timedatectl                                                     # note: still UTC here — PRODUCTION_DEPLOYMENT.md sets IST later, in its own step
systemctl list-unit-files --state=enabled | grep -c .           # sanity: services list is readable
```

Nothing to fix here in the normal case — this is just confirming the instance is in the healthy state every later step assumes.

---

## 8 · Hand off

The box is now: patched, sanity-checked, swap-protected, reachable two ways, and its patching is automated. Continue with:

**→ `PRODUCTION_DEPLOYMENT.md` § "One-time server setup"** (Node 22 install via `dnf`, the dedicated `techbuilder` service user, `/opt/techbuilder` layout, Caddy install) — everything from here on is app-specific, not instance-specific.

Do **not** repeat the timezone step from this doc — `PRODUCTION_DEPLOYMENT.md`'s own "Timezone" subsection handles that later in the sequence; running it twice is harmless but redundant.

---

## If you're actually on Ubuntu instead

This doc was originally written for Ubuntu 24.04 LTS and was rewritten for Amazon Linux 2023 on 2026-07-15 once that became the real, standing instance. If a future instance genuinely goes back to an Ubuntu AMI, the equivalents are: `apt-get update && apt-get upgrade -y` (§3), `ufw` (§5, and it IS pre-installed there), `unattended-upgrades` (§6, `sudo dpkg-reconfigure -plow unattended-upgrades`), login user `ubuntu` (§1), and `lsb_release -a` instead of `cat /etc/os-release` (§2). The swap-file steps (§4) are identical on any distro.
