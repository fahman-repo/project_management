-- ============================================================================
-- Project Management System - Database Schema
-- Target: MySQL 8.0 / MariaDB 10.1+ (utf8mb4, InnoDB)
-- NOTE: MariaDB 10.1 does NOT support window functions, CTEs, or native JSON
--       type. All queries in this app are written to be compatible.
-- ============================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name          VARCHAR(120)  NOT NULL,
  email         VARCHAR(191)  NOT NULL,
  password      VARCHAR(255)  NOT NULL,
  role          ENUM('admin','manager','member') NOT NULL DEFAULT 'member',
  phone         VARCHAR(30)   NULL,
  avatar        VARCHAR(255)  NULL,
  job_title     VARCHAR(120)  NULL,
  bio           TEXT          NULL,
  is_active     TINYINT(1)    NOT NULL DEFAULT 1,
  last_login_at DATETIME      NULL,
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  KEY idx_users_role (role),
  KEY idx_users_is_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- project_templates
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS project_templates (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  code        VARCHAR(50)   NOT NULL,
  name        VARCHAR(180)  NOT NULL,
  category    VARCHAR(80)   NOT NULL DEFAULT 'General',
  description TEXT          NULL,
  color       VARCHAR(20)   NOT NULL DEFAULT '#4f46e5',
  is_system   TINYINT(1)    NOT NULL DEFAULT 0,
  created_by  INT UNSIGNED  NULL,
  created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_template_code (code),
  KEY idx_template_category (category),
  CONSTRAINT fk_template_creator FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- project_template_statuses
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS project_template_statuses (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  template_id INT UNSIGNED NOT NULL,
  key_name    VARCHAR(50)  NOT NULL,
  label       VARCHAR(80)  NOT NULL,
  color       VARCHAR(20)  NOT NULL DEFAULT '#64748b',
  category    ENUM('todo','in_progress','review','done','blocked') NOT NULL DEFAULT 'in_progress',
  progress    TINYINT UNSIGNED NOT NULL DEFAULT 0,
  position    INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_pts_key (template_id, key_name),
  KEY idx_pts_position (template_id, position),
  CONSTRAINT fk_pts_template FOREIGN KEY (template_id) REFERENCES project_templates (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- project_template_milestones
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS project_template_milestones (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  template_id     INT UNSIGNED NOT NULL,
  name            VARCHAR(180) NOT NULL,
  description     TEXT         NULL,
  due_offset_days INT          NOT NULL DEFAULT 0,
  position        INT          NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  CONSTRAINT fk_ptm_template FOREIGN KEY (template_id) REFERENCES project_templates (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- project_template_tasks
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS project_template_tasks (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  template_id       INT UNSIGNED NOT NULL,
  parent_temp_id    INT UNSIGNED NULL,
  title             VARCHAR(220) NOT NULL,
  description       TEXT         NULL,
  status_key        VARCHAR(50)  NOT NULL DEFAULT 'todo',
  priority          ENUM('low','medium','high','urgent') NOT NULL DEFAULT 'medium',
  estimated_hours   DECIMAL(8,2) NULL,
  estimated_cost    DECIMAL(15,2) NULL DEFAULT 0.00,
  start_offset_days INT          NULL,
  due_offset_days   INT          NULL,
  position          INT          NOT NULL DEFAULT 0,
  is_milestone      TINYINT(1)   NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_ptt_template (template_id),
  KEY idx_ptt_parent (parent_temp_id),
  CONSTRAINT fk_ptt_template FOREIGN KEY (template_id) REFERENCES project_templates (id) ON DELETE CASCADE,
  CONSTRAINT fk_ptt_parent FOREIGN KEY (parent_temp_id) REFERENCES project_template_tasks (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- projects
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS projects (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  code        VARCHAR(50)   NOT NULL,
  name        VARCHAR(180)  NOT NULL,
  description TEXT          NULL,
  status      ENUM('planning','active','on_hold','completed','cancelled') NOT NULL DEFAULT 'planning',
  priority    ENUM('low','medium','high','urgent') NOT NULL DEFAULT 'medium',
  progress    TINYINT UNSIGNED NOT NULL DEFAULT 0,
  color       VARCHAR(20)   NOT NULL DEFAULT '#4f46e5',
  budget      DECIMAL(15,2) NULL,
  start_date  DATE          NULL,
  end_date    DATE          NULL,
  manager_id  INT UNSIGNED  NULL,
  created_by  INT UNSIGNED  NULL,
  template_id INT UNSIGNED  NULL,
  created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_projects_code (code),
  KEY idx_projects_status (status),
  KEY idx_projects_priority (priority),
  KEY idx_projects_manager (manager_id),
  KEY idx_projects_dates (start_date, end_date),
  KEY idx_projects_template (template_id),
  CONSTRAINT fk_projects_manager FOREIGN KEY (manager_id) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_projects_creator FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_projects_template FOREIGN KEY (template_id) REFERENCES project_templates (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- project_statuses (per-project kanban / workflow stages)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS project_statuses (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_id  INT UNSIGNED NOT NULL,
  key_name    VARCHAR(50)  NOT NULL,
  label       VARCHAR(80)  NOT NULL,
  color       VARCHAR(20)  NOT NULL DEFAULT '#64748b',
  category    ENUM('todo','in_progress','review','done','blocked') NOT NULL DEFAULT 'in_progress',
  progress    TINYINT UNSIGNED NOT NULL DEFAULT 0,
  position    INT NOT NULL DEFAULT 0,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_project_status_key (project_id, key_name),
  KEY idx_ps_project_pos (project_id, position),
  CONSTRAINT fk_ps_project FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- project_members (M:N user <-> project)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS project_members (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_id INT UNSIGNED NOT NULL,
  user_id    INT UNSIGNED NOT NULL,
  role       ENUM('owner','manager','member','reviewer') NOT NULL DEFAULT 'member',
  joined_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_project_member (project_id, user_id),
  KEY idx_pm_user (user_id),
  CONSTRAINT fk_pm_project FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
  CONSTRAINT fk_pm_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- labels
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS labels (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name       VARCHAR(60) NOT NULL,
  color      VARCHAR(20) NOT NULL DEFAULT '#64748b',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_labels_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- milestones
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS milestones (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_id  INT UNSIGNED NOT NULL,
  name        VARCHAR(180) NOT NULL,
  description TEXT         NULL,
  due_date    DATE         NULL,
  status      ENUM('planned','in_progress','achieved','missed') NOT NULL DEFAULT 'planned',
  progress    TINYINT UNSIGNED NOT NULL DEFAULT 0,
  created_by  INT UNSIGNED NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_milestones_project (project_id),
  KEY idx_milestones_due (due_date),
  CONSTRAINT fk_milestones_project FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
  CONSTRAINT fk_milestones_creator FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- tasks  (parent_id = self reference for sub-tasks)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tasks (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_id      INT UNSIGNED NOT NULL,
  parent_id       INT UNSIGNED NULL,
  title           VARCHAR(220) NOT NULL,
  description     TEXT         NULL,
  status          VARCHAR(50)  NOT NULL DEFAULT 'todo',
  priority        ENUM('low','medium','high','urgent') NOT NULL DEFAULT 'medium',
  assignee_id     INT UNSIGNED NULL,
  reporter_id     INT UNSIGNED NULL,
  start_date      DATE         NULL,
  due_date        DATE         NULL,
  completed_at    DATETIME     NULL,
  estimated_hours DECIMAL(8,2) NULL,
  actual_hours    DECIMAL(8,2) NULL,
  estimated_cost  DECIMAL(15,2) NULL DEFAULT 0.00,
  actual_cost     DECIMAL(15,2) NULL DEFAULT 0.00,
  progress        TINYINT UNSIGNED NOT NULL DEFAULT 0,
  position        INT NOT NULL DEFAULT 0,
  is_milestone    TINYINT(1) NOT NULL DEFAULT 0,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_tasks_project_status (project_id, status),
  KEY idx_tasks_parent (parent_id),
  KEY idx_tasks_assignee (assignee_id),
  KEY idx_tasks_due (due_date),
  KEY idx_tasks_status (status),
  KEY idx_tasks_position (project_id, status, position),
  CONSTRAINT fk_tasks_project FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
  CONSTRAINT fk_tasks_parent FOREIGN KEY (parent_id) REFERENCES tasks (id) ON DELETE CASCADE,
  CONSTRAINT fk_tasks_assignee FOREIGN KEY (assignee_id) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_tasks_reporter FOREIGN KEY (reporter_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- task_dependencies
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS task_dependencies (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  task_id       INT UNSIGNED NOT NULL,
  depends_on_id INT UNSIGNED NOT NULL,
  type          ENUM('blocked_by','blocks','relates_to','duplicate_of') NOT NULL DEFAULT 'blocked_by',
  lag_days      INT NOT NULL DEFAULT 0,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_task_dep (task_id, depends_on_id),
  KEY idx_dep_task (task_id),
  KEY idx_dep_depends_on (depends_on_id),
  CONSTRAINT fk_dep_task FOREIGN KEY (task_id) REFERENCES tasks (id) ON DELETE CASCADE,
  CONSTRAINT fk_dep_depends_on FOREIGN KEY (depends_on_id) REFERENCES tasks (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- task_labels
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS task_labels (
  task_id  INT UNSIGNED NOT NULL,
  label_id INT UNSIGNED NOT NULL,
  PRIMARY KEY (task_id, label_id),
  KEY idx_tl_label (label_id),
  CONSTRAINT fk_tl_task FOREIGN KEY (task_id) REFERENCES tasks (id) ON DELETE CASCADE,
  CONSTRAINT fk_tl_label FOREIGN KEY (label_id) REFERENCES labels (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- task_comments
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS task_comments (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  task_id    INT UNSIGNED NOT NULL,
  user_id    INT UNSIGNED NOT NULL,
  body       TEXT         NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_comments_task (task_id),
  KEY idx_comments_user (user_id),
  CONSTRAINT fk_comments_task FOREIGN KEY (task_id) REFERENCES tasks (id) ON DELETE CASCADE,
  CONSTRAINT fk_comments_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- task_attachments
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS task_attachments (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  task_id       INT UNSIGNED NOT NULL,
  uploader_id   INT UNSIGNED NULL,
  original_name VARCHAR(255) NOT NULL,
  stored_name   VARCHAR(255) NOT NULL,
  mime_type     VARCHAR(120) NOT NULL,
  size          INT UNSIGNED NOT NULL DEFAULT 0,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_attach_task (task_id),
  CONSTRAINT fk_attach_task FOREIGN KEY (task_id) REFERENCES tasks (id) ON DELETE CASCADE,
  CONSTRAINT fk_attach_uploader FOREIGN KEY (uploader_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- ---------------------------------------------------------------------------
-- project_expenses (itemized project/task expense ledger)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS project_expenses (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_id   INT UNSIGNED NOT NULL,
  task_id      INT UNSIGNED NULL,
  title        VARCHAR(180) NOT NULL,
  category     ENUM('material','vendor','equipment','operational','labor','other') NOT NULL DEFAULT 'other',
  amount       DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  expense_date DATE NOT NULL,
  vendor_name  VARCHAR(150) NULL,
  receipt_note VARCHAR(500) NULL,
  created_by   INT UNSIGNED NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_pe_project_date (project_id, expense_date),
  KEY idx_pe_task (task_id),
  KEY idx_pe_category (category),
  CONSTRAINT fk_pe_project FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
  CONSTRAINT fk_pe_task FOREIGN KEY (task_id) REFERENCES tasks (id) ON DELETE SET NULL,
  CONSTRAINT fk_pe_creator FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- activities (audit trail)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS activities (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id      INT UNSIGNED NULL,
  project_id   INT UNSIGNED NULL,
  task_id      INT UNSIGNED NULL,
  action       VARCHAR(50)  NOT NULL,
  entity_type  VARCHAR(40)  NULL,
  entity_id    INT UNSIGNED NULL,
  description  VARCHAR(500) NULL,
  metadata     LONGTEXT     NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_act_project (project_id, created_at),
  KEY idx_act_task (task_id),
  KEY idx_act_user (user_id),
  KEY idx_act_created (created_at),
  CONSTRAINT fk_act_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_act_project FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
  CONSTRAINT fk_act_task FOREIGN KEY (task_id) REFERENCES tasks (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- notifications
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id    INT UNSIGNED NOT NULL,
  type       ENUM('info','success','warning','danger','task','mention') NOT NULL DEFAULT 'info',
  title      VARCHAR(180) NOT NULL,
  message    VARCHAR(500) NULL,
  link       VARCHAR(255) NULL,
  is_read    TINYINT(1) NOT NULL DEFAULT 0,
  read_at    DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_notif_user_read (user_id, is_read),
  KEY idx_notif_created (created_at),
  CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
