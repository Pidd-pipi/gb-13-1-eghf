import { DataSource } from 'typeorm';
import { AppDataSource } from '../config/database';

/**
 * 数据源访问入口。
 * 生产环境使用 MySQL 单例 AppDataSource；集成测试中可通过 setDataSourceOverride
 * 注入内存 SQLite 数据源，服务层无需关心底层数据库类型。
 */
let dataSourceOverride: DataSource | null = null;

export const setDataSourceOverride = (dataSource: DataSource | null) => {
  dataSourceOverride = dataSource;
};

export const ds = (): DataSource => dataSourceOverride ?? AppDataSource;
