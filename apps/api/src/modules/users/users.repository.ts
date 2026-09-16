import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../infrastructure/database/database.service';

@Injectable()
export class UsersRepository {
  constructor(private readonly database: DatabaseService) {}

  async findById(id: string) {
    const result = await this.database.query('SELECT id, email, phone, status, created_at, updated_at FROM users WHERE id = $1', [id]);
    return result.rows[0] ?? null;
  }

  async findByEmail(email: string) {
    const result = await this.database.query('SELECT id, email, phone, status, created_at, updated_at FROM users WHERE email = $1', [email]);
    return result.rows[0] ?? null;
  }
}
