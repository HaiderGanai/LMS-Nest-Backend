import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { JobsModule } from './jobs/jobs.module';
import { AdminModule } from './modules/admin/admin.module';
import { AlertsModule } from './modules/alerts/alerts.module';
import { AuthModule } from './modules/auth/auth.module';
import { CallsModule } from './modules/calls/calls.module';
import { ComplaintsModule } from './modules/complaints/complaints.module';
import { CoursesModule } from './modules/courses/courses.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { AnnouncementsModule } from './modules/announcements/announcements.module';
import { RemindersModule } from './modules/reminders/reminders.module';
import { NewsModule } from './modules/news/news.module';
import { ActionLogsModule } from './modules/action-logs/action-logs.module';
import { ReportsModule } from './modules/reports/reports.module';
import { ChatModule } from './modules/chat/chat.module';
import { ParentModule } from './modules/parent/parent.module';
import { AppConfigModule } from './modules/app-config/app-config.module';
import { EmailModule } from './modules/email/email.module';
import { AlertPatternsModule } from './modules/alert-patterns/alert-patterns.module';
import { SignalingModule } from './modules/signaling/signaling.module';
import { SystemConfigModule } from './modules/config/system-config.module';
import { DailyClassesModule } from './modules/daily-classes/daily-classes.module';
import { EmployeesModule } from './modules/employees/employees.module';
import { FamiliesModule } from './modules/families/families.module';
import { FinancialModule } from './modules/financial/financial.module';
import { MessagesModule } from './modules/messages/messages.module';
import { RecordingsModule } from './modules/recordings/recordings.module';
import { SalariesModule } from './modules/salaries/salaries.module';
import { SchedulingModule } from './modules/scheduling/scheduling.module';
import { StudentsModule } from './modules/students/students.module';
import { TelemetryModule } from './modules/telemetry/telemetry.module';
import { UsersModule } from './modules/users/users.module';
import { SharedModule } from './shared/shared.module';
import { StorageModule } from './modules/storage/storage.module';

@Module({
  imports: [
    ConfigModule,
    SharedModule,
    AuthModule,
    UsersModule,
    EmployeesModule,
    StudentsModule,
    FamiliesModule,
    SchedulingModule,
    MessagesModule,
    AlertsModule,
    CallsModule,
    RecordingsModule,
    FinancialModule,
    SalariesModule,
    ComplaintsModule,
    CoursesModule,
    TasksModule,
    AnnouncementsModule,
    RemindersModule,
    NewsModule,
    ActionLogsModule,
    ReportsModule,
    ChatModule,
    ParentModule,
    AppConfigModule,
    EmailModule,
    AlertPatternsModule,
    SignalingModule,
    TelemetryModule,
    AdminModule,
    SystemConfigModule,
    DailyClassesModule,
    JobsModule,
    StorageModule,
  ],
})
export class AppModule {}
