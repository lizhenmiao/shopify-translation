import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';

// 日志级别定义
const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// 日志颜色配置
const LOG_COLORS = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'blue',
};

// 创建日志格式
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(
    (info) => `${info.timestamp} [${info.level}]: ${info.message}`
  )
);

// 创建日志传输配置
const transports = [
  // 控制台输出
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize({ all: true }),
      logFormat
    ),
    level: 'debug',
  }),

  // 每日滚动文件日志 - 错误日志
  new DailyRotateFile({
    level: 'error',
    filename: path.join(process.cwd(), 'logs/error', 'error-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    zippedArchive: true,
    maxSize: '20m',
    maxFiles: '14d',
  }),

  // 每日滚动文件日志 - 综合日志
  new DailyRotateFile({
    level: 'info',
    filename: path.join(process.cwd(), 'logs/combined', 'combined-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    zippedArchive: true,
    maxSize: '20m',
    maxFiles: '14d',
  }),
];

// 创建 Winston 日志记录器
const logger = winston.createLogger({
  levels: LOG_LEVELS,
  format: logFormat,
  transports: transports,
});

// 为控制台输出添加颜色
winston.addColors(LOG_COLORS);

// 日志记录器封装
class Logger {
  /**
   * 记录错误日志
   * @param message 错误消息
   * @param meta 额外元数据
   */
  static error(message: string, ...meta: any[]) {
    logger.error(message, ...meta);
  }

  /**
   * 记录警告日志
   * @param message 警告消息
   * @param meta 额外元数据
   */
  static warn(message: string, ...meta: any[]) {
    logger.warn(message, ...meta);
  }

  /**
   * 记录普通信息日志
   * @param message 信息消息
   * @param meta 额外元数据
   */
  static info(message: string, ...meta: any[]) {
    logger.info(message, ...meta);
  }

  /**
   * 记录 HTTP 相关日志
   * @param message HTTP 日志消息
   * @param meta 额外元数据
   */
  static http(message: string, ...meta: any[]) {
    logger.http(message, ...meta);
  }

  /**
   * 记录调试日志
   * @param message 调试消息
   * @param meta 额外元数据
   */
  static debug(message: string, ...meta: any[]) {
    logger.debug(message, ...meta);
  }
}

export default Logger;