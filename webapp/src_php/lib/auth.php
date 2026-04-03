<?php

require_once __DIR__ . '/bootstrap.php';

function auth_start_session($config)
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }

    $secureCookie = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (!empty($_SERVER['SERVER_PORT']) && (int) $_SERVER['SERVER_PORT'] === 443);
    session_name('docdoc_auth');
    session_set_cookie_params([
        'lifetime' => 0,
        'path' => '/',
        'secure' => $secureCookie,
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    session_start();
}

function auth_read_json_body()
{
    $raw = file_get_contents('php://input');
    $payload = json_decode($raw, true);
    if (!is_array($payload)) {
        php_backend_error(400, 'Invalid JSON request body.');
    }

    return $payload;
}

function auth_get_db_config($config)
{
    $servername = trim((string) ($config['db_servername'] ?? getenv('DB_SERVERNAME') ?: ''));
    $username = trim((string) ($config['db_username'] ?? getenv('DB_USERNAME') ?: ''));
    $password = (string) ($config['db_password'] ?? getenv('DB_PASSWORD') ?: '');
    $dbname = trim((string) ($config['db_name'] ?? getenv('DB_NAME') ?: ''));
    $port = (int) ($config['db_port'] ?? getenv('DB_PORT') ?: 3306);

    if ($servername === '' || $username === '' || $dbname === '') {
        php_backend_error(500, 'Database configuration is missing. Set db_servername, db_username, db_password, and db_name in config.php.');
    }

    return [
        'servername' => $servername,
        'username' => $username,
        'password' => $password,
        'dbname' => $dbname,
        'port' => $port,
    ];
}

function auth_get_pdo($config)
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $db = auth_get_db_config($config);
    $dsn = sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4', $db['servername'], $db['port'], $db['dbname']);

    try {
        $pdo = new PDO($dsn, $db['username'], $db['password'], [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
    } catch (Throwable $e) {
        php_backend_error(500, 'Failed to connect to auth database: ' . $e->getMessage());
    }

    return $pdo;
}

function auth_normalize_email($email)
{
    return strtolower(trim((string) $email));
}

function auth_validate_password($password)
{
    if (!is_string($password) || strlen($password) < 8) {
        php_backend_error(400, 'Password must be at least 8 characters.');
    }
}

function auth_generate_token()
{
    return bin2hex(random_bytes(32));
}

function auth_token_hash($token)
{
    return hash('sha256', (string) $token);
}

function auth_get_user_by_email(PDO $pdo, $emailNormalized)
{
    $stmt = $pdo->prepare('SELECT * FROM users WHERE email_normalized = :email LIMIT 1');
    $stmt->execute(['email' => $emailNormalized]);
    return $stmt->fetch() ?: null;
}

function auth_get_user_by_id(PDO $pdo, $userId)
{
    $stmt = $pdo->prepare('SELECT id, email, display_name, status FROM users WHERE id = :id LIMIT 1');
    $stmt->execute(['id' => $userId]);
    return $stmt->fetch() ?: null;
}

function auth_public_user($user)
{
    return [
        'id' => isset($user['id']) ? (int) $user['id'] : null,
        'email' => $user['email'] ?? '',
        'displayName' => $user['display_name'] ?? '',
        'status' => $user['status'] ?? '',
    ];
}

function auth_config_bool($value, $default = false)
{
    if ($value === null) {
        return $default;
    }
    if (is_bool($value)) {
        return $value;
    }
    if (is_numeric($value)) {
        return ((int) $value) !== 0;
    }
    $normalized = strtolower(trim((string) $value));
    return in_array($normalized, ['1', 'true', 'yes', 'on'], true);
}

function auth_should_return_tokens($config)
{
    return auth_config_bool($config['auth_return_tokens_in_response'] ?? false, false);
}

function auth_mailer_enabled($config)
{
    $envEnabled = getenv('SMTP_ENABLED');
    if ($envEnabled !== false && $envEnabled !== '') {
        return auth_config_bool($envEnabled, false);
    }
    return auth_config_bool($config['smtp_enabled'] ?? false, false);
}

function auth_mailer_src_path($config)
{
    if (!empty($config['phpmailer_src_path'])) {
        return rtrim((string) $config['phpmailer_src_path'], '/');
    }
    $envPath = getenv('PHPMAILER_SRC_PATH');
    if ($envPath) {
        return rtrim((string) $envPath, '/');
    }
    return dirname(__DIR__) . '/third_party/PHPMailer/src';
}

function auth_mailer_require($config)
{
    if (class_exists('PHPMailer\\PHPMailer\\PHPMailer')) {
        return;
    }

    $srcPath = auth_mailer_src_path($config);
    $requiredFiles = [
        $srcPath . '/Exception.php',
        $srcPath . '/PHPMailer.php',
        $srcPath . '/SMTP.php',
    ];

    foreach ($requiredFiles as $file) {
        if (!file_exists($file)) {
            php_backend_error(500, 'PHPMailer source files not found. Set `phpmailer_src_path` in config.php.');
        }
        require_once $file;
    }
}

function auth_mailer_config($config)
{
    return [
        'host' => (string) (getenv('SMTP_HOST') ?: ($config['smtp_host'] ?? '')),
        'port' => (int) (getenv('SMTP_PORT') ?: ($config['smtp_port'] ?? 587)),
        'username' => (string) (getenv('SMTP_USERNAME') ?: ($config['smtp_username'] ?? '')),
        'password' => (string) (getenv('SMTP_PASSWORD') ?: ($config['smtp_password'] ?? '')),
        'secure' => (string) (getenv('SMTP_SECURE') ?: ($config['smtp_secure'] ?? 'tls')),
        'from_email' => (string) (getenv('SMTP_FROM_EMAIL') ?: ($config['smtp_from_email'] ?? '')),
        'from_name' => (string) (getenv('SMTP_FROM_NAME') ?: ($config['smtp_from_name'] ?? 'A-Ideation')),
    ];
}

function auth_base_url($config)
{
    if (!empty($config['app_base_url'])) {
        return rtrim((string) $config['app_base_url'], '/');
    }

    $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
    $host = (string) ($_SERVER['HTTP_HOST'] ?? 'localhost');
    $scriptDir = rtrim(str_replace('\\', '/', dirname((string) ($_SERVER['SCRIPT_NAME'] ?? '/'))), '/');

    // auth endpoints live in /api/auth/*/index.php, so strip /api/auth/* from script path.
    $apiPos = strpos($scriptDir, '/api/auth');
    if ($apiPos !== false) {
        $scriptDir = substr($scriptDir, 0, $apiPos);
    }

    return rtrim($scheme . '://' . $host . $scriptDir, '/');
}

function auth_send_email($config, $toEmail, $toName, $subject, $htmlBody, $textBody)
{
    if (!auth_mailer_enabled($config)) {
        return;
    }

    auth_mailer_require($config);
    $smtp = auth_mailer_config($config);
    if ($smtp['host'] === '' || $smtp['username'] === '' || $smtp['password'] === '' || $smtp['from_email'] === '') {
        php_backend_error(500, 'SMTP is enabled but SMTP credentials are incomplete in config.php.');
    }

    $mailer = new PHPMailer\PHPMailer\PHPMailer(true);
    $mailer->isSMTP();
    $mailer->Host = $smtp['host'];
    $mailer->Port = $smtp['port'];
    $mailer->SMTPAuth = true;
    $mailer->Username = $smtp['username'];
    $mailer->Password = $smtp['password'];
    $mailer->SMTPSecure = $smtp['secure'];
    $mailer->setFrom($smtp['from_email'], $smtp['from_name']);
    $mailer->addAddress($toEmail, $toName);
    $mailer->isHTML(true);
    $mailer->Subject = $subject;
    $mailer->Body = $htmlBody;
    $mailer->AltBody = $textBody;
    $mailer->send();
}

function auth_send_verification_email($config, $toEmail, $toName, $token)
{
    $baseUrl = auth_base_url($config);
    $verifyLink = $baseUrl . '/verify-email?token=' . urlencode((string) $token);
    $subject = 'Verify your A-Ideation account';
    $htmlBody = '<p>Welcome to A-Ideation.</p><p>Use this token to verify your email:</p><pre>' . htmlspecialchars((string) $token) . '</pre><p>Optional link: <a href=\"' . htmlspecialchars($verifyLink) . '\">' . htmlspecialchars($verifyLink) . '</a></p>';
    $textBody = "Welcome to A-Ideation.\n\nUse this token to verify your email:\n" . $token . "\n\nOptional link:\n" . $verifyLink;

    auth_send_email($config, $toEmail, $toName, $subject, $htmlBody, $textBody);
}

function auth_send_reset_email($config, $toEmail, $toName, $token)
{
    $baseUrl = auth_base_url($config);
    $resetLink = $baseUrl . '/reset-password?token=' . urlencode((string) $token);
    $subject = 'Reset your A-Ideation password';
    $htmlBody = '<p>You requested a password reset.</p><p>Use this token to reset your password:</p><pre>' . htmlspecialchars((string) $token) . '</pre><p>Optional link: <a href=\"' . htmlspecialchars($resetLink) . '\">' . htmlspecialchars($resetLink) . '</a></p>';
    $textBody = "You requested a password reset.\n\nUse this token to reset your password:\n" . $token . "\n\nOptional link:\n" . $resetLink;

    auth_send_email($config, $toEmail, $toName, $subject, $htmlBody, $textBody);
}
