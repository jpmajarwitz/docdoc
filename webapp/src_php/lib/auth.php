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

function auth_session_timeout_seconds($config)
{
    $raw = $config['auth_session_timeout_seconds'] ?? getenv('AUTH_SESSION_TIMEOUT_SECONDS') ?: 43200;
    $timeout = (int) $raw;
    if ($timeout < 60) {
        $timeout = 60;
    }
    return $timeout;
}

function auth_user_sessions_columns(PDO $pdo)
{
    static $cached = null;
    if (is_array($cached)) {
        return $cached;
    }

    $cached = [];
    $stmt = $pdo->query('SHOW COLUMNS FROM user_sessions');
    foreach ($stmt->fetchAll() as $row) {
        $field = isset($row['Field']) ? strtolower((string) $row['Field']) : '';
        if ($field !== '') {
            $cached[$field] = true;
        }
    }

    return $cached;
}

function auth_user_sessions_has_column(PDO $pdo, $columnName)
{
    $columns = auth_user_sessions_columns($pdo);
    return isset($columns[strtolower((string) $columnName)]);
}

function auth_create_or_refresh_session_record(PDO $pdo, $sessionId, $userId, $timeoutSeconds)
{
    $hasCreatedAt = auth_user_sessions_has_column($pdo, 'created_at');
    $hasLastActivityAt = auth_user_sessions_has_column($pdo, 'last_activity_at');
    $hasTimeoutDuration = auth_user_sessions_has_column($pdo, 'session_timeout_duration');
    $hasSessionStatus = auth_user_sessions_has_column($pdo, 'session_status');
    $hasRevokedAt = auth_user_sessions_has_column($pdo, 'revoked_at');

    $insertColumns = ['session_id', 'user_id'];
    $insertValues = [':session_id', ':user_id'];
    if ($hasCreatedAt) {
        $insertColumns[] = 'created_at';
        $insertValues[] = 'UTC_TIMESTAMP()';
    }
    if ($hasLastActivityAt) {
        $insertColumns[] = 'last_activity_at';
        $insertValues[] = 'UTC_TIMESTAMP()';
    }
    if ($hasTimeoutDuration) {
        $insertColumns[] = 'session_timeout_duration';
        $insertValues[] = ':session_timeout_duration';
    }
    if ($hasSessionStatus) {
        $insertColumns[] = 'session_status';
        $insertValues[] = ':session_status';
    }
    if ($hasRevokedAt) {
        $insertColumns[] = 'revoked_at';
        $insertValues[] = 'NULL';
    }

    $updateFragments = [
        'user_id = VALUES(user_id)',
    ];
    if ($hasLastActivityAt) {
        $updateFragments[] = 'last_activity_at = UTC_TIMESTAMP()';
    }
    if ($hasTimeoutDuration) {
        $updateFragments[] = 'session_timeout_duration = VALUES(session_timeout_duration)';
    }
    if ($hasSessionStatus) {
        $updateFragments[] = "session_status = 'active'";
    }
    if ($hasRevokedAt) {
        $updateFragments[] = 'revoked_at = NULL';
    }

    $sql = sprintf(
        'INSERT INTO user_sessions (%s) VALUES (%s) ON DUPLICATE KEY UPDATE %s',
        implode(', ', $insertColumns),
        implode(', ', $insertValues),
        implode(', ', $updateFragments)
    );

    $params = [
        'session_id' => $sessionId,
        'user_id' => (int) $userId,
    ];
    if ($hasTimeoutDuration) {
        $params['session_timeout_duration'] = (int) $timeoutSeconds;
    }
    if ($hasSessionStatus) {
        $params['session_status'] = 'active';
    }

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
}

function auth_get_active_session_record(PDO $pdo, $sessionId)
{
    $hasRevokedAt = auth_user_sessions_has_column($pdo, 'revoked_at');
    $hasCreatedAt = auth_user_sessions_has_column($pdo, 'created_at');
    $hasLastActivityAt = auth_user_sessions_has_column($pdo, 'last_activity_at');
    $hasTimeoutDuration = auth_user_sessions_has_column($pdo, 'session_timeout_duration');
    $hasSessionStatus = auth_user_sessions_has_column($pdo, 'session_status');
    $selectColumns = ['session_id', 'user_id'];
    if ($hasCreatedAt) {
        $selectColumns[] = 'created_at';
    }
    if ($hasLastActivityAt) {
        $selectColumns[] = 'last_activity_at';
    }
    if ($hasTimeoutDuration) {
        $selectColumns[] = 'session_timeout_duration';
    }
    if ($hasSessionStatus) {
        $selectColumns[] = 'session_status';
    }
    if ($hasRevokedAt) {
        $selectColumns[] = 'revoked_at';
    }

    $sql = sprintf(
        'SELECT %s FROM user_sessions WHERE session_id = :session_id LIMIT 1',
        implode(', ', $selectColumns)
    );
    $stmt = $pdo->prepare($sql);
    $stmt->execute(['session_id' => $sessionId]);
    $record = $stmt->fetch();
    if (!$record) {
        return null;
    }

    if ($hasRevokedAt && !empty($record['revoked_at'])) {
        return null;
    }

    if ($hasSessionStatus && strtolower((string) ($record['session_status'] ?? '')) !== 'active') {
        return null;
    }

    return $record;
}

function auth_session_record_is_expired($record)
{
    if (!is_array($record)) {
        return true;
    }

    $createdAt = isset($record['created_at']) ? strtotime((string) $record['created_at']) : false;
    $lastActivityAt = isset($record['last_activity_at']) ? strtotime((string) $record['last_activity_at']) : false;
    $timeoutSeconds = isset($record['session_timeout_duration']) ? (int) $record['session_timeout_duration'] : 0;

    if ($createdAt === false || $lastActivityAt === false || $timeoutSeconds <= 0) {
        return false;
    }

    $elapsed = $lastActivityAt - $createdAt;
    return $elapsed > $timeoutSeconds;
}

function auth_touch_session_record(PDO $pdo, $sessionId, $timeoutSeconds)
{
    $hasLastActivityAt = auth_user_sessions_has_column($pdo, 'last_activity_at');
    $hasTimeoutDuration = auth_user_sessions_has_column($pdo, 'session_timeout_duration');
    $hasSessionStatus = auth_user_sessions_has_column($pdo, 'session_status');
    $hasRevokedAt = auth_user_sessions_has_column($pdo, 'revoked_at');
    $setFragments = [];
    if ($hasLastActivityAt) {
        $setFragments[] = 'last_activity_at = UTC_TIMESTAMP()';
    }
    if ($hasTimeoutDuration) {
        $setFragments[] = 'session_timeout_duration = :session_timeout_duration';
    }
    if ($hasSessionStatus) {
        $setFragments[] = "session_status = 'active'";
    }
    if (empty($setFragments)) {
        return;
    }
    $whereFragments = ['session_id = :session_id'];
    if ($hasRevokedAt) {
        $whereFragments[] = 'revoked_at IS NULL';
    }
    $sql = sprintf(
        'UPDATE user_sessions SET %s WHERE %s',
        implode(', ', $setFragments),
        implode(' AND ', $whereFragments)
    );
    $params = ['session_id' => $sessionId];
    if ($hasTimeoutDuration) {
        $params['session_timeout_duration'] = (int) $timeoutSeconds;
    }
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
}

function auth_revoke_session_record(PDO $pdo, $sessionId)
{
    $hasSessionStatus = auth_user_sessions_has_column($pdo, 'session_status');
    $hasRevokedAt = auth_user_sessions_has_column($pdo, 'revoked_at');
    if ($hasSessionStatus) {
        $setFragments = ["session_status = 'terminated'"];
        if ($hasRevokedAt) {
            $setFragments[] = 'revoked_at = UTC_TIMESTAMP()';
        }
        $stmt = $pdo->prepare(
            sprintf(
                'UPDATE user_sessions SET %s WHERE session_id = :session_id',
                implode(', ', $setFragments)
            )
        );
        $stmt->execute(['session_id' => $sessionId]);
        return;
    }

    if ($hasRevokedAt) {
        $stmt = $pdo->prepare(
            'UPDATE user_sessions
             SET revoked_at = UTC_TIMESTAMP()
             WHERE session_id = :session_id AND revoked_at IS NULL'
        );
        $stmt->execute(['session_id' => $sessionId]);
        return;
    }

    $stmt = $pdo->prepare('DELETE FROM user_sessions WHERE session_id = :session_id');
    $stmt->execute(['session_id' => $sessionId]);
}

function auth_clear_session_state()
{
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $params = session_get_cookie_params();
        setcookie(session_name(), '', time() - 42000, $params['path'], $params['domain'], $params['secure'], $params['httponly']);
    }
    session_destroy();
}

function auth_require_active_session($config)
{
    auth_start_session($config);
    if (empty($_SESSION['auth_user_id'])) {
        php_backend_error(401, 'Session expired. Please login again.');
    }

    $pdo = auth_get_pdo($config);
    $sessionId = session_id();
    $sessionRecord = auth_get_active_session_record($pdo, $sessionId);
    if (!$sessionRecord || (int) $sessionRecord['user_id'] !== (int) $_SESSION['auth_user_id']) {
        auth_revoke_session_record($pdo, $sessionId);
        auth_clear_session_state();
        php_backend_error(401, 'Session expired. Please login again.');
    }

    if (auth_session_record_is_expired($sessionRecord)) {
        auth_revoke_session_record($pdo, $sessionId);
        auth_clear_session_state();
        php_backend_error(401, 'Session expired. Please login again.');
    }

    auth_touch_session_record($pdo, $sessionId, auth_session_timeout_seconds($config));
    return auth_get_user_by_id($pdo, (int) $_SESSION['auth_user_id']);
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
        return [
            'attempted' => false,
            'sent' => false,
            'error' => 'SMTP is disabled.',
        ];
    }

    auth_mailer_require($config);
    $smtp = auth_mailer_config($config);
    php_backend_log('auth.smtp_attempt', [
        'to' => $toEmail,
        'subject' => $subject,
        'host' => $smtp['host'],
        'port' => $smtp['port'],
        'secure' => $smtp['secure'],
        'username' => $smtp['username'],
        'password' => $smtp['password'],
        'from_email' => $smtp['from_email'],
        'from_name' => $smtp['from_name'],
    ]);

    if ($smtp['host'] === '' || $smtp['username'] === '' || $smtp['password'] === '' || $smtp['from_email'] === '') {
        php_backend_log('auth.smtp_config_invalid', [
            'host' => $smtp['host'],
            'port' => $smtp['port'],
            'secure' => $smtp['secure'],
            'username' => $smtp['username'],
            'password' => $smtp['password'],
            'from_email' => $smtp['from_email'],
            'from_name' => $smtp['from_name'],
        ]);
        return [
            'attempted' => true,
            'sent' => false,
            'error' => 'SMTP is enabled but SMTP credentials are incomplete in config.php.',
        ];
    }

    try {
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
        $mailer->Timeout = (int) ($config['smtp_timeout_seconds'] ?? 15);
        $mailer->send();

        php_backend_log('auth.smtp_send_success', [
            'to' => $toEmail,
            'subject' => $subject,
            'host' => $smtp['host'],
            'port' => $smtp['port'],
            'secure' => $smtp['secure'],
            'username' => $smtp['username'],
            'password' => $smtp['password'],
            'from_email' => $smtp['from_email'],
            'from_name' => $smtp['from_name'],
        ]);

        return [
            'attempted' => true,
            'sent' => true,
            'error' => null,
        ];
    } catch (Throwable $exception) {
        php_backend_log('auth.smtp_send_failed', [
            'to' => $toEmail,
            'subject' => $subject,
            'error' => $exception->getMessage(),
            'host' => $smtp['host'],
            'port' => $smtp['port'],
            'secure' => $smtp['secure'],
            'username' => $smtp['username'],
            'password' => $smtp['password'],
            'from_email' => $smtp['from_email'],
            'from_name' => $smtp['from_name'],
        ]);
        return [
            'attempted' => true,
            'sent' => false,
            'error' => $exception->getMessage(),
        ];
    }
}

function auth_send_verification_email($config, $toEmail, $toName, $token)
{
    $subject = 'Verify your A-Ideation account';
    $htmlBody = '<p>Welcome to A-Ideation.</p><p>Use this token to verify your email:</p><pre>' . htmlspecialchars((string) $token) . '</pre>';
    $textBody = "Welcome to A-Ideation.\n\nUse this token to verify your email:\n" . $token;

    return auth_send_email($config, $toEmail, $toName, $subject, $htmlBody, $textBody);
}

function auth_send_reset_email($config, $toEmail, $toName, $token)
{
    $subject = 'Reset your A-Ideation password';
    $htmlBody = '<p>You requested a password reset.</p><p>Use this token to reset your password:</p><pre>' . htmlspecialchars((string) $token) . '</pre>';
    $textBody = "You requested a password reset.\n\nUse this token to reset your password:\n" . $token;

    return auth_send_email($config, $toEmail, $toName, $subject, $htmlBody, $textBody);
}
