# A1 Suite — Installation and Transfer Procedures
# A1 Suite — Инструкция установки и переноса
# A1 Suite — Տեղադրման և տեղափոխման հրահանգներ

**Repository:** `SamStep74/A1-Suite-Local`  
**Primary server base:** Mac Studio MQH63LL/A  
**Target use case:** A1 Suite / A1 HayHashvapah / A1 CRM for Armenian businesses, with local-first and online private-server deployment options.  
**Document version:** 2026-06-01

---

## 0. Operator principle / Принцип оператора / Օպերատորի սկզբունք

### EN
A1 Suite must be operated as a portable self-hosted business suite. Do not design it as a one-machine-only installation. Keep the product portable by separating:

```text
code
configuration
data
client/tenant context
backup/restore procedure
network exposure layer
```

### RU
A1 Suite нужно эксплуатировать как переносимый self-hosted business suite. Не проектируйте систему как установку, навсегда привязанную к одному компьютеру. Переносимость достигается разделением:

```text
код
конфигурация
данные
контекст клиента/tenant
процедура backup/restore
сетевой слой публикации
```

### HY
A1 Suite-ը պետք է շահագործել որպես տեղափոխելի self-hosted business suite։ Չպետք է այն կառուցել որպես մեկ համակարգչին մշտապես կապված տեղադրում։ Տեղափոխելիությունը ապահովվում է հետևյալ բաժանումով՝

```text
կոդ
կոնֆիգուրացիա
տվյալներ
հաճախորդի/tenant context
backup/restore ընթացակարգ
ցանցային հրապարակման շերտ
```

---

# EN — English Instructions

## 1. Current runtime model

The current A1 Suite repository is a Node.js local-server application. The current package scripts include:

```bash
npm install
npm run build:ui
npm start
npm test
npm run smoke
npm run install:server
npm run backup
```

Node.js `>=22.5` is required.

Default local URL:

```text
http://127.0.0.1:4100
```

Default data location on macOS:

```text
~/Library/Application Support/ArmospheraOneClaude/armosphera-one.db
```

Default data location on Linux:

```text
~/.local/share/armosphera-one-claude/armosphera-one.db
```

The application is local-first and outbound network access is off by default. For online client access, expose it through a controlled gateway, tunnel, or reverse proxy. Do not expose the Mac Studio directly through router port forwarding.

## 2. Mac Studio preparation

On the Mac Studio MQH63LL/A:

```text
1. Update macOS.
2. Enable FileVault.
3. Disable automatic login.
4. Create a dedicated server-admin account.
5. Connect UPS.
6. Use a stable primary internet connection and backup ISP/4G/5G where possible.
7. Keep the Mac Studio in a locked and ventilated room.
8. Keep SSH/VNC/admin access limited to trusted operators.
```

Recommended operating pattern:

```text
Mac Studio host
  -> local A1 Suite service for controlled deployments
  -> optional Ubuntu ARM64 VM for gateway/platform services
  -> reverse proxy/tunnel for online Armenian clients
  -> encrypted local backup
  -> encrypted offsite backup
```

## 3. Local installation on Mac Studio

### 3.1 Install prerequisites

Install Node.js 22.5 or newer and Git.

Check:

```bash
node -v
git --version
```

### 3.2 Clone repository

```bash
mkdir -p ~/A1
cd ~/A1
git clone git@github.com:SamStep74/A1-Suite-Local.git
cd A1-Suite-Local
```

### 3.3 Build and run manually

```bash
npm install
npm run build:ui
npm start
```

Open:

```text
http://127.0.0.1:4100
```

### 3.4 Install as local server service

```bash
PORT=4100 npm run install:server
```

The installer checks Node.js, installs dependencies, builds UI, optionally installs the legal knowledge base, and on macOS creates/loads a launchd service.

### 3.5 Optional Armenian law knowledge base

If you have `laws.sqlite`, install it:

```bash
node scripts/install-laws.js /path/to/laws.sqlite
```

If no path is provided, the installer checks the default HayHashvapah source path:

```text
~/Library/Application Support/HayHashvapahWebClaude/data/laws.sqlite
```

## 4. Linux / VM installation

Use this when running A1 Suite inside an Ubuntu ARM64 VM or a VPS.

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl sqlite3 ca-certificates
```

Install Node.js `>=22.5`.

Clone and build:

```bash
sudo mkdir -p /opt/a1-suite
sudo chown -R $USER:$USER /opt/a1-suite
cd /opt/a1-suite
git clone git@github.com:SamStep74/A1-Suite-Local.git .
npm install
npm run build:ui
```

Run manually:

```bash
PORT=4100 HOST=127.0.0.1 npm start
```

Install systemd unit using the template shown by:

```bash
PORT=4100 npm run install:server
```

## 5. Online access for Armenian clients

For online clients, keep A1 Suite bound to loopback/private network and expose it safely:

```text
client browser
  -> client.a1suite.am
  -> Cloudflare DNS/WAF or VPS gateway
  -> tunnel/VPN/private reverse proxy
  -> Mac Studio or VM
  -> A1 Suite on 127.0.0.1:4100 or tenant-specific port
```

Recommended options:

```text
Option A: Cloudflare Tunnel -> local A1 Suite
Option B: small VPS gateway -> WireGuard/Tailscale -> Mac Studio
Option C: private data-center server -> reverse proxy -> A1 Suite
```

Runtime note: Client/tenant production access should use Linux VM runtime and Docker Engine. Docker Desktop is a macOS/Windows developer desktop app and should not be a client runtime dependency or license condition.

Do not publish the A1 Suite process directly on a public IP.

## 6. Tenant/client isolation model

The current app uses SQLite. For Armenian SMB online deployments, use one isolated instance per client until a full tenant registry/database-per-tenant platform is implemented.

Recommended instance model:

```text
Client: ararat-trade
Domain: ararat.a1suite.am
Port: 4110
Data dir: /srv/a1-suite/tenants/ararat-trade/data
Database: /srv/a1-suite/tenants/ararat-trade/data/armosphera-one.db
Backup dir: /srv/a1-suite/tenants/ararat-trade/backups
```

Start an isolated tenant instance:

```bash
export PORT=4110
export HOST=127.0.0.1
export ARMOSPHERA_ONE_DATA_DIR=/srv/a1-suite/tenants/ararat-trade/data
export ARMOSPHERA_ONE_DB=/srv/a1-suite/tenants/ararat-trade/data/armosphera-one.db
npm start
```

Use separate launchd/systemd service files for each paid online client.

## 7. Backup procedure

### 7.1 Default backup

```bash
npm run backup
```

### 7.2 Backup to a specific directory

```bash
npm run backup -- /Volumes/A1Backups/ararat-trade
```

### 7.3 Backup custom tenant DB

```bash
export ARMOSPHERA_ONE_DB=/srv/a1-suite/tenants/ararat-trade/data/armosphera-one.db
bash deploy/backup.sh /srv/a1-suite/tenants/ararat-trade/backups
```

Minimum backup policy:

```text
Hourly or every 4 hours: tenant DB backup for active clients
Nightly: full tenant data directory backup
Weekly: encrypted offsite backup
Monthly: restore test on another machine
```

A backup is valid only after a successful restore test.

## 8. Transfer one client/tenant

Use this to move one client from Mac Studio to another Mac Studio, VPS, data center, or cloud server.

### Step 1 — Announce maintenance

Put the client into a short maintenance window. Stop the tenant service:

```bash
launchctl unload ~/Library/LaunchAgents/com.armosphera.one.ararat-trade.plist
# or on Linux:
sudo systemctl stop a1-suite-ararat-trade
```

### Step 2 — Create final backup

```bash
export ARMOSPHERA_ONE_DB=/srv/a1-suite/tenants/ararat-trade/data/armosphera-one.db
bash deploy/backup.sh /srv/a1-suite/tenants/ararat-trade/backups
```

### Step 3 — Export tenant package

```bash
mkdir -p /tmp/a1-transfer/ararat-trade
rsync -a /srv/a1-suite/tenants/ararat-trade/data/ /tmp/a1-transfer/ararat-trade/data/
rsync -a /srv/a1-suite/tenants/ararat-trade/backups/ /tmp/a1-transfer/ararat-trade/backups/
cat > /tmp/a1-transfer/ararat-trade/tenant.env <<'TENANT_ENV'
PORT=4110
HOST=127.0.0.1
ARMOSPHERA_ONE_DATA_DIR=/srv/a1-suite/tenants/ararat-trade/data
ARMOSPHERA_ONE_DB=/srv/a1-suite/tenants/ararat-trade/data/armosphera-one.db
TENANT_DOMAIN=ararat.a1suite.am
TENANT_CODE=ararat-trade
TENANT_ENV
```

Package:

```bash
cd /tmp/a1-transfer
tar -czf ararat-trade-a1-transfer-$(date +%Y%m%d-%H%M%S).tar.gz ararat-trade
```

### Step 4 — Copy package to target server

```bash
scp ararat-trade-a1-transfer-*.tar.gz user@target-server:/tmp/
```

### Step 5 — Prepare target server

```bash
sudo mkdir -p /opt/a1-suite /srv/a1-suite/tenants/ararat-trade
sudo chown -R $USER:$USER /opt/a1-suite /srv/a1-suite
cd /opt/a1-suite
git clone git@github.com:SamStep74/A1-Suite-Local.git .
npm install
npm run build:ui
```

### Step 6 — Restore tenant data

```bash
cd /tmp
tar -xzf ararat-trade-a1-transfer-*.tar.gz
rsync -a ararat-trade/data/ /srv/a1-suite/tenants/ararat-trade/data/
rsync -a ararat-trade/backups/ /srv/a1-suite/tenants/ararat-trade/backups/
```

### Step 7 — Start service on target

```bash
cd /opt/a1-suite
export PORT=4110
export HOST=127.0.0.1
export ARMOSPHERA_ONE_DATA_DIR=/srv/a1-suite/tenants/ararat-trade/data
export ARMOSPHERA_ONE_DB=/srv/a1-suite/tenants/ararat-trade/data/armosphera-one.db
npm start
```

For production, create a systemd/launchd service using the same environment values.

### Step 8 — Validate

```bash
curl -I http://127.0.0.1:4110
npm test
npm run smoke
```

Validate manually:

```text
login works
owner dashboard opens
CRM records are present
HayHashvapah documents are present
legal search works if laws.sqlite is installed
latest backup is visible
new backup can be created
```

### Step 9 — Switch routing

Change only gateway/proxy/DNS routing:

```text
before: ararat.a1suite.am -> old Mac Studio
 after: ararat.a1suite.am -> target server
```

### Step 10 — Rollback plan

If validation fails, switch the route back to the old Mac Studio and restart the old tenant service.

## 9. Transfer the whole service

Use this for disaster recovery or full infrastructure migration.

```text
1. Freeze changes / announce maintenance window.
2. Stop all A1 Suite services.
3. Run final backup for every tenant.
4. Archive all tenant data directories.
5. Archive launchd/systemd unit files and environment files.
6. Clone the same repository on the target server.
7. Install Node.js >=22.5.
8. Run npm install and npm run build:ui.
9. Restore tenant data directories.
10. Recreate services.
11. Validate every tenant.
12. Switch gateway/DNS.
13. Keep old server read-only for a defined safety period.
```

Whole-service export example:

```bash
sudo systemctl stop 'a1-suite-*' || true
mkdir -p /tmp/a1-full-transfer
rsync -a /srv/a1-suite/ /tmp/a1-full-transfer/srv-a1-suite/
rsync -a /opt/a1-suite/ /tmp/a1-full-transfer/opt-a1-suite-source/
tar -czf a1-full-transfer-$(date +%Y%m%d-%H%M%S).tar.gz -C /tmp a1-full-transfer
```

## 10. Security checklist

```text
FileVault enabled on Mac Studio.
No public router port forwarding to A1 Suite.
Gateway/tunnel/VPN used for online clients.
Separate tenant data directories.
Separate ports and service files per client.
2FA for admin/operator accounts where possible.
Backups encrypted before offsite upload.
Restore test performed monthly.
Secrets not committed to GitHub.
Outbound network remains off unless explicitly required.
```

---

# RU — Инструкция на русском

## 1. Текущая модель запуска

Текущий репозиторий A1 Suite — это Node.js local-server приложение. Основные команды:

```bash
npm install
npm run build:ui
npm start
npm test
npm run smoke
npm run install:server
npm run backup
```

Требуется Node.js `>=22.5`.

Локальный URL по умолчанию:

```text
http://127.0.0.1:4100
```

Стандартный путь базы на macOS:

```text
~/Library/Application Support/ArmospheraOneClaude/armosphera-one.db
```

Стандартный путь базы на Linux:

```text
~/.local/share/armosphera-one-claude/armosphera-one.db
```

Продукт local-first, и outbound network выключен по умолчанию. Для online-доступа клиентов используйте gateway, tunnel или reverse proxy. Не открывайте Mac Studio напрямую через port forwarding.

## 2. Подготовка Mac Studio

На Mac Studio MQH63LL/A:

```text
1. Обновить macOS.
2. Включить FileVault.
3. Отключить automatic login.
4. Создать отдельного server-admin пользователя.
5. Подключить UPS.
6. Использовать стабильный основной интернет и резервный ISP/4G/5G по возможности.
7. Держать Mac Studio в закрытом и вентилируемом помещении.
8. Ограничить SSH/VNC/admin доступ только доверенным операторам.
```

Рекомендуемая схема эксплуатации:

```text
Mac Studio host
  -> локальный A1 Suite service
  -> optional Ubuntu ARM64 VM для gateway/platform services
  -> reverse proxy/tunnel для online-клиентов в Армении
  -> encrypted local backup
  -> encrypted offsite backup
```

## 3. Установка на Mac Studio

### 3.1 Установить зависимости

Установить Node.js 22.5 или новее и Git.

Проверка:

```bash
node -v
git --version
```

### 3.2 Клонировать репозиторий

```bash
mkdir -p ~/A1
cd ~/A1
git clone git@github.com:SamStep74/A1-Suite-Local.git
cd A1-Suite-Local
```

### 3.3 Ручной запуск

```bash
npm install
npm run build:ui
npm start
```

Открыть:

```text
http://127.0.0.1:4100
```

### 3.4 Установка как локальный сервис

```bash
PORT=4100 npm run install:server
```

Installer проверяет Node.js, ставит зависимости, собирает UI, опционально подключает legal knowledge base и на macOS создает/загружает launchd service.

### 3.5 Armenian law knowledge base

Если есть `laws.sqlite`, установить:

```bash
node scripts/install-laws.js /path/to/laws.sqlite
```

Если путь не указан, installer проверяет стандартный путь HayHashvapah:

```text
~/Library/Application Support/HayHashvapahWebClaude/data/laws.sqlite
```

## 4. Установка на Linux / VM

Используется для Ubuntu ARM64 VM или VPS.

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl sqlite3 ca-certificates
```

Установить Node.js `>=22.5`.

Клонирование и сборка:

```bash
sudo mkdir -p /opt/a1-suite
sudo chown -R $USER:$USER /opt/a1-suite
cd /opt/a1-suite
git clone git@github.com:SamStep74/A1-Suite-Local.git .
npm install
npm run build:ui
```

Ручной запуск:

```bash
PORT=4100 HOST=127.0.0.1 npm start
```

Для systemd используйте шаблон, который показывает:

```bash
PORT=4100 npm run install:server
```

## 5. Online-доступ для армянских клиентов

Для online-клиентов держите A1 Suite на loopback/private network и публикуйте безопасно:

```text
браузер клиента
  -> client.a1suite.am
  -> Cloudflare DNS/WAF или VPS gateway
  -> tunnel/VPN/private reverse proxy
  -> Mac Studio или VM
  -> A1 Suite на 127.0.0.1:4100 или tenant-specific port
```

Рекомендуемые варианты:

```text
Вариант A: Cloudflare Tunnel -> local A1 Suite
Вариант B: small VPS gateway -> WireGuard/Tailscale -> Mac Studio
Вариант C: private data-center server -> reverse proxy -> A1 Suite
```

Примечание по runtime: продакшн/tenant доступ должен идти через Linux VM с Docker Engine. Docker Desktop — desktop-продукт для macOS/Windows и не должен рассматриваться как зависимость рантайма для клиента и его лицензирования.

Не публикуйте A1 Suite process напрямую на public IP.

## 6. Изоляция клиентов / tenants

Текущая версия использует SQLite. Для online-внедрений армянским SMB используйте отдельный instance на клиента, пока не реализован полноценный tenant registry/database-per-tenant platform.

Рекомендуемая модель instance:

```text
Client: ararat-trade
Domain: ararat.a1suite.am
Port: 4110
Data dir: /srv/a1-suite/tenants/ararat-trade/data
Database: /srv/a1-suite/tenants/ararat-trade/data/armosphera-one.db
Backup dir: /srv/a1-suite/tenants/ararat-trade/backups
```

Запуск отдельного tenant instance:

```bash
export PORT=4110
export HOST=127.0.0.1
export ARMOSPHERA_ONE_DATA_DIR=/srv/a1-suite/tenants/ararat-trade/data
export ARMOSPHERA_ONE_DB=/srv/a1-suite/tenants/ararat-trade/data/armosphera-one.db
npm start
```

Для каждого платного online-клиента используйте отдельный launchd/systemd service.

## 7. Backup procedure

### 7.1 Backup по умолчанию

```bash
npm run backup
```

### 7.2 Backup в конкретную папку

```bash
npm run backup -- /Volumes/A1Backups/ararat-trade
```

### 7.3 Backup кастомной tenant DB

```bash
export ARMOSPHERA_ONE_DB=/srv/a1-suite/tenants/ararat-trade/data/armosphera-one.db
bash deploy/backup.sh /srv/a1-suite/tenants/ararat-trade/backups
```

Минимальная политика:

```text
каждый час или каждые 4 часа: backup tenant DB для активных клиентов
каждую ночь: backup всей tenant data directory
каждую неделю: encrypted offsite backup
каждый месяц: restore test на другой машине
```

Backup считается рабочим только после успешного restore test.

## 8. Перенос одного клиента / tenant

Используется для переноса одного клиента с Mac Studio на другой Mac Studio, VPS, дата-центр или cloud.

### Шаг 1 — Maintenance window

Остановить tenant service:

```bash
launchctl unload ~/Library/LaunchAgents/com.armosphera.one.ararat-trade.plist
# или на Linux:
sudo systemctl stop a1-suite-ararat-trade
```

### Шаг 2 — Финальный backup

```bash
export ARMOSPHERA_ONE_DB=/srv/a1-suite/tenants/ararat-trade/data/armosphera-one.db
bash deploy/backup.sh /srv/a1-suite/tenants/ararat-trade/backups
```

### Шаг 3 — Export tenant package

```bash
mkdir -p /tmp/a1-transfer/ararat-trade
rsync -a /srv/a1-suite/tenants/ararat-trade/data/ /tmp/a1-transfer/ararat-trade/data/
rsync -a /srv/a1-suite/tenants/ararat-trade/backups/ /tmp/a1-transfer/ararat-trade/backups/
cat > /tmp/a1-transfer/ararat-trade/tenant.env <<'TENANT_ENV'
PORT=4110
HOST=127.0.0.1
ARMOSPHERA_ONE_DATA_DIR=/srv/a1-suite/tenants/ararat-trade/data
ARMOSPHERA_ONE_DB=/srv/a1-suite/tenants/ararat-trade/data/armosphera-one.db
TENANT_DOMAIN=ararat.a1suite.am
TENANT_CODE=ararat-trade
TENANT_ENV
```

Упаковка:

```bash
cd /tmp/a1-transfer
tar -czf ararat-trade-a1-transfer-$(date +%Y%m%d-%H%M%S).tar.gz ararat-trade
```

### Шаг 4 — Скопировать package на target server

```bash
scp ararat-trade-a1-transfer-*.tar.gz user@target-server:/tmp/
```

### Шаг 5 — Подготовить target server

```bash
sudo mkdir -p /opt/a1-suite /srv/a1-suite/tenants/ararat-trade
sudo chown -R $USER:$USER /opt/a1-suite /srv/a1-suite
cd /opt/a1-suite
git clone git@github.com:SamStep74/A1-Suite-Local.git .
npm install
npm run build:ui
```

### Шаг 6 — Restore tenant data

```bash
cd /tmp
tar -xzf ararat-trade-a1-transfer-*.tar.gz
rsync -a ararat-trade/data/ /srv/a1-suite/tenants/ararat-trade/data/
rsync -a ararat-trade/backups/ /srv/a1-suite/tenants/ararat-trade/backups/
```

### Шаг 7 — Запуск на target

```bash
cd /opt/a1-suite
export PORT=4110
export HOST=127.0.0.1
export ARMOSPHERA_ONE_DATA_DIR=/srv/a1-suite/tenants/ararat-trade/data
export ARMOSPHERA_ONE_DB=/srv/a1-suite/tenants/ararat-trade/data/armosphera-one.db
npm start
```

Для production создайте systemd/launchd service с теми же environment values.

### Шаг 8 — Validation

```bash
curl -I http://127.0.0.1:4110
npm test
npm run smoke
```

Ручная проверка:

```text
login работает
owner dashboard открывается
CRM records на месте
HayHashvapah documents на месте
legal search работает, если установлен laws.sqlite
latest backup доступен
новый backup создается
```

### Шаг 9 — Переключить routing

Меняется только gateway/proxy/DNS route:

```text
до:    ararat.a1suite.am -> old Mac Studio
после: ararat.a1suite.am -> target server
```

### Шаг 10 — Rollback

Если validation не прошла, вернуть route на старый Mac Studio и запустить старый tenant service.

## 9. Перенос всего сервиса

Используется для disaster recovery или полной миграции инфраструктуры.

```text
1. Заморозить изменения / объявить maintenance window.
2. Остановить все A1 Suite services.
3. Сделать финальный backup каждого tenant.
4. Архивировать все tenant data directories.
5. Архивировать launchd/systemd unit files и environment files.
6. Клонировать тот же repository на target server.
7. Установить Node.js >=22.5.
8. Выполнить npm install и npm run build:ui.
9. Восстановить tenant data directories.
10. Воссоздать services.
11. Проверить каждый tenant.
12. Переключить gateway/DNS.
13. Оставить old server read-only на согласованный период.
```

Пример full export:

```bash
sudo systemctl stop 'a1-suite-*' || true
mkdir -p /tmp/a1-full-transfer
rsync -a /srv/a1-suite/ /tmp/a1-full-transfer/srv-a1-suite/
rsync -a /opt/a1-suite/ /tmp/a1-full-transfer/opt-a1-suite-source/
tar -czf a1-full-transfer-$(date +%Y%m%d-%H%M%S).tar.gz -C /tmp a1-full-transfer
```

## 10. Security checklist

```text
FileVault включен на Mac Studio.
Нет public router port forwarding на A1 Suite.
Для online-клиентов используется gateway/tunnel/VPN.
Отдельные tenant data directories.
Отдельные ports и service files на клиента.
2FA для admin/operator accounts, где возможно.
Backups шифруются перед offsite upload.
Restore test проводится ежемесячно.
Secrets не коммитятся в GitHub.
Outbound network остается выключенным, если явно не нужен.
```

---

# HY — Հայերեն հրահանգներ

## 1. Ներկա runtime model

A1 Suite-ի ներկա repository-ն Node.js local-server application է։ Հիմնական commands՝

```bash
npm install
npm run build:ui
npm start
npm test
npm run smoke
npm run install:server
npm run backup
```

Պահանջվում է Node.js `>=22.5`։

Լոկալ URL՝

```text
http://127.0.0.1:4100
```

macOS default database path՝

```text
~/Library/Application Support/ArmospheraOneClaude/armosphera-one.db
```

Linux default database path՝

```text
~/.local/share/armosphera-one-claude/armosphera-one.db
```

Արտադրանքը local-first է, և outbound network-ը default անջատված է։ Online հաճախորդների access-ի համար օգտագործեք gateway, tunnel կամ reverse proxy։ Mac Studio-ն ուղիղ public internet-ին մի բացեք router port forwarding-ով։

## 2. Mac Studio-ի պատրաստում

Mac Studio MQH63LL/A-ի վրա՝

```text
1. Թարմացնել macOS-ը։
2. Միացնել FileVault-ը։
3. Անջատել automatic login-ը։
4. Ստեղծել dedicated server-admin user։
5. Միացնել UPS։
6. Օգտագործել կայուն հիմնական internet և պահուստային ISP/4G/5G, եթե հնարավոր է։
7. Պահել Mac Studio-ն փակ և օդափոխվող սենյակում։
8. SSH/VNC/admin access-ը սահմանափակել միայն վստահելի operators-ի համար։
```

Առաջարկվող շահագործման ձև՝

```text
Mac Studio host
  -> local A1 Suite service
  -> optional Ubuntu ARM64 VM gateway/platform services-ի համար
  -> reverse proxy/tunnel հայկական online հաճախորդների համար
  -> encrypted local backup
  -> encrypted offsite backup
```

## 3. Տեղադրում Mac Studio-ի վրա

### 3.1 Install prerequisites

Տեղադրել Node.js 22.5 կամ ավելի նոր և Git։

Ստուգում՝

```bash
node -v
git --version
```

### 3.2 Clone repository

```bash
mkdir -p ~/A1
cd ~/A1
git clone git@github.com:SamStep74/A1-Suite-Local.git
cd A1-Suite-Local
```

### 3.3 Manual run

```bash
npm install
npm run build:ui
npm start
```

Բացել՝

```text
http://127.0.0.1:4100
```

### 3.4 Տեղադրում որպես local server service

```bash
PORT=4100 npm run install:server
```

Installer-ը ստուգում է Node.js-ը, տեղադրում dependencies, build անում UI, անհրաժեշտության դեպքում տեղադրում legal knowledge base և macOS-ում ստեղծում/բեռնում launchd service։

### 3.5 Armenian law knowledge base

Եթե ունեք `laws.sqlite`, տեղադրեք՝

```bash
node scripts/install-laws.js /path/to/laws.sqlite
```

Եթե path չի տրվում, installer-ը ստուգում է HayHashvapah-ի default path-ը՝

```text
~/Library/Application Support/HayHashvapahWebClaude/data/laws.sqlite
```

## 4. Տեղադրում Linux / VM-ում

Օգտագործվում է Ubuntu ARM64 VM-ի կամ VPS-ի համար։

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl sqlite3 ca-certificates
```

Տեղադրել Node.js `>=22.5`։

Clone և build՝

```bash
sudo mkdir -p /opt/a1-suite
sudo chown -R $USER:$USER /opt/a1-suite
cd /opt/a1-suite
git clone git@github.com:SamStep74/A1-Suite-Local.git .
npm install
npm run build:ui
```

Manual run՝

```bash
PORT=4100 HOST=127.0.0.1 npm start
```

Systemd template-ի համար օգտագործեք այն հրահանգը, որը ցույց է տալիս՝

```bash
PORT=4100 npm run install:server
```

## 5. Online access հայկական հաճախորդների համար

Online հաճախորդների համար A1 Suite-ը պահեք loopback/private network-ում և հրապարակեք անվտանգ ձևով՝

```text
client browser
  -> client.a1suite.am
  -> Cloudflare DNS/WAF կամ VPS gateway
  -> tunnel/VPN/private reverse proxy
  -> Mac Studio կամ VM
  -> A1 Suite 127.0.0.1:4100-ի կամ tenant-specific port-ի վրա
```

Առաջարկվող տարբերակներ՝

```text
Տարբերակ A: Cloudflare Tunnel -> local A1 Suite
Տարբերակ B: small VPS gateway -> WireGuard/Tailscale -> Mac Studio
Տարբերակ C: private data-center server -> reverse proxy -> A1 Suite
```

Runtime note: մուտք հասանելիությունը պետք է կատարվի Linux VM և Docker Engine միջավայրում: Docker Desktop-ը հատուկ macOS/Windows դեսքթոփ միջավայրի գործիք է և չի պետք դիտել որպես տենանտի ռելիզի կախվածություն կամ լիցենզավորման պահանջ։

A1 Suite process-ը ուղիղ public IP-ի վրա մի հրապարակեք։

## 6. Client / tenant isolation

Ներկա տարբերակը օգտագործում է SQLite։ Armenian SMB online deployment-ների համար օգտագործեք մեկ isolated instance յուրաքանչյուր հաճախորդի համար, մինչև tenant registry/database-per-tenant platform-ը ամբողջությամբ ներդրվի։

Առաջարկվող instance model՝

```text
Client: ararat-trade
Domain: ararat.a1suite.am
Port: 4110
Data dir: /srv/a1-suite/tenants/ararat-trade/data
Database: /srv/a1-suite/tenants/ararat-trade/data/armosphera-one.db
Backup dir: /srv/a1-suite/tenants/ararat-trade/backups
```

Առանձին tenant instance-ի գործարկում՝

```bash
export PORT=4110
export HOST=127.0.0.1
export ARMOSPHERA_ONE_DATA_DIR=/srv/a1-suite/tenants/ararat-trade/data
export ARMOSPHERA_ONE_DB=/srv/a1-suite/tenants/ararat-trade/data/armosphera-one.db
npm start
```

Յուրաքանչյուր վճարող online հաճախորդի համար օգտագործեք առանձին launchd/systemd service։

## 7. Backup procedure

### 7.1 Default backup

```bash
npm run backup
```

### 7.2 Backup հատուկ directory-ում

```bash
npm run backup -- /Volumes/A1Backups/ararat-trade
```

### 7.3 Custom tenant DB backup

```bash
export ARMOSPHERA_ONE_DB=/srv/a1-suite/tenants/ararat-trade/data/armosphera-one.db
bash deploy/backup.sh /srv/a1-suite/tenants/ararat-trade/backups
```

Նվազագույն backup policy՝

```text
ամեն ժամ կամ 4 ժամը մեկ: tenant DB backup ակտիվ clients-ի համար
ամեն գիշեր: ամբողջ tenant data directory backup
ամեն շաբաթ: encrypted offsite backup
ամեն ամիս: restore test այլ մեքենայի վրա
```

Backup-ը վստահելի է միայն հաջող restore test-ից հետո։

## 8. Մեկ client / tenant տեղափոխում

Օգտագործվում է մեկ client-ը Mac Studio-ից երկրորդ Mac Studio, VPS, data center կամ cloud տեղափոխելու համար։

### Քայլ 1 — Maintenance window

Կանգնեցնել tenant service-ը՝

```bash
launchctl unload ~/Library/LaunchAgents/com.armosphera.one.ararat-trade.plist
# կամ Linux-ում՝
sudo systemctl stop a1-suite-ararat-trade
```

### Քայլ 2 — Վերջնական backup

```bash
export ARMOSPHERA_ONE_DB=/srv/a1-suite/tenants/ararat-trade/data/armosphera-one.db
bash deploy/backup.sh /srv/a1-suite/tenants/ararat-trade/backups
```

### Քայլ 3 — Export tenant package

```bash
mkdir -p /tmp/a1-transfer/ararat-trade
rsync -a /srv/a1-suite/tenants/ararat-trade/data/ /tmp/a1-transfer/ararat-trade/data/
rsync -a /srv/a1-suite/tenants/ararat-trade/backups/ /tmp/a1-transfer/ararat-trade/backups/
cat > /tmp/a1-transfer/ararat-trade/tenant.env <<'TENANT_ENV'
PORT=4110
HOST=127.0.0.1
ARMOSPHERA_ONE_DATA_DIR=/srv/a1-suite/tenants/ararat-trade/data
ARMOSPHERA_ONE_DB=/srv/a1-suite/tenants/ararat-trade/data/armosphera-one.db
TENANT_DOMAIN=ararat.a1suite.am
TENANT_CODE=ararat-trade
TENANT_ENV
```

Package՝

```bash
cd /tmp/a1-transfer
tar -czf ararat-trade-a1-transfer-$(date +%Y%m%d-%H%M%S).tar.gz ararat-trade
```

### Քայլ 4 — Copy package դեպի target server

```bash
scp ararat-trade-a1-transfer-*.tar.gz user@target-server:/tmp/
```

### Քայլ 5 — Target server-ի պատրաստում

```bash
sudo mkdir -p /opt/a1-suite /srv/a1-suite/tenants/ararat-trade
sudo chown -R $USER:$USER /opt/a1-suite /srv/a1-suite
cd /opt/a1-suite
git clone git@github.com:SamStep74/A1-Suite-Local.git .
npm install
npm run build:ui
```

### Քայլ 6 — Restore tenant data

```bash
cd /tmp
tar -xzf ararat-trade-a1-transfer-*.tar.gz
rsync -a ararat-trade/data/ /srv/a1-suite/tenants/ararat-trade/data/
rsync -a ararat-trade/backups/ /srv/a1-suite/tenants/ararat-trade/backups/
```

### Քայլ 7 — Start target-ում

```bash
cd /opt/a1-suite
export PORT=4110
export HOST=127.0.0.1
export ARMOSPHERA_ONE_DATA_DIR=/srv/a1-suite/tenants/ararat-trade/data
export ARMOSPHERA_ONE_DB=/srv/a1-suite/tenants/ararat-trade/data/armosphera-one.db
npm start
```

Production-ի համար ստեղծեք systemd/launchd service նույն environment values-ով։

### Քայլ 8 — Validation

```bash
curl -I http://127.0.0.1:4110
npm test
npm run smoke
```

Manual validation՝

```text
login աշխատում է
owner dashboard բացվում է
CRM records առկա են
HayHashvapah documents առկա են
legal search աշխատում է, եթե laws.sqlite տեղադրված է
latest backup հասանելի է
նոր backup ստեղծվում է
```

### Քայլ 9 — Routing switch

Փոխվում է միայն gateway/proxy/DNS route-ը՝

```text
before: ararat.a1suite.am -> old Mac Studio
after:  ararat.a1suite.am -> target server
```

### Քայլ 10 — Rollback

Եթե validation-ը ձախողվում է, վերադարձնել route-ը հին Mac Studio-ի վրա և գործարկել հին tenant service-ը։

## 9. Ամբողջ ծառայության տեղափոխում

Օգտագործվում է disaster recovery-ի կամ ամբողջական infrastructure migration-ի համար։

```text
1. Սառեցնել փոփոխությունները / հայտարարել maintenance window։
2. Կանգնեցնել բոլոր A1 Suite services-ը։
3. Ստեղծել final backup յուրաքանչյուր tenant-ի համար։
4. Archive անել բոլոր tenant data directories-ը։
5. Archive անել launchd/systemd unit files և environment files։
6. Clone անել նույն repository-ն target server-ի վրա։
7. Տեղադրել Node.js >=22.5։
8. Կատարել npm install և npm run build:ui։
9. Restore անել tenant data directories-ը։
10. Recreate անել services-ը։
11. Ստուգել յուրաքանչյուր tenant։
12. Փոխել gateway/DNS-ը։
13. Հին server-ը պահել read-only սահմանված safety period-ի համար։
```

Full export example՝

```bash
sudo systemctl stop 'a1-suite-*' || true
mkdir -p /tmp/a1-full-transfer
rsync -a /srv/a1-suite/ /tmp/a1-full-transfer/srv-a1-suite/
rsync -a /opt/a1-suite/ /tmp/a1-full-transfer/opt-a1-suite-source/
tar -czf a1-full-transfer-$(date +%Y%m%d-%H%M%S).tar.gz -C /tmp a1-full-transfer
```

## 10. Security checklist

```text
FileVault enabled Mac Studio-ի վրա։
Չկա public router port forwarding դեպի A1 Suite։
Online clients-ի համար օգտագործվում է gateway/tunnel/VPN։
Առանձին tenant data directories։
Առանձին ports և service files յուրաքանչյուր client-ի համար։
2FA admin/operator accounts-ի համար, որտեղ հնարավոր է։
Backups-ը շիֆրավորվում է offsite upload-ից առաջ։
Restore test կատարվում է ամեն ամիս։
Secrets չեն commit արվում GitHub-ում։
Outbound network-ը մնում է անջատված, եթե explicit անհրաժեշտություն չկա։
```
