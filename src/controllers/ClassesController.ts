import { Request, Response } from "express";

import db from "../database/connection";
import convertHourToMinutes from "../utils/convertHourToMinutes";

interface ScheduleItem {
  week_day: number;
  from: string;
  to: string;
}

export default class ClassesController {
  async index(request: Request, response: Response) {
    const filters = request.query;

    const subject = filters.subject as string;
    const week_day = filters.week_day as string;
    const time = filters.time as string;
    
    if (!filters.week_day || !filters.subject || !filters.time) {
      return response.status(400).json({
        error: "Missing filters to search classes",
      });
    }

    const timeInMinutes = convertHourToMinutes(time);

    const classes = await db.from('classes')
      .whereExists(function() {
        this.select('class_schedule.*')
          .from('class_schedule')
          .whereRaw('`class_schedule`.`class_id` = `classes`.`id`')
          .whereRaw('`class_schedule`.`week_day` = ??', [Number(week_day)])
          .whereRaw('`class_schedule`.`from` <= ??', [timeInMinutes])
          .whereRaw('`class_schedule`.`to` > ??', [timeInMinutes])
      })
      .where('classes.subject', '=', subject)
      .join('users', 'classes.user_id', '=', 'users.id')
      .select(['classes.*', 'users.*']);

    return response.json(classes)
  }

  async create(request: Request, response: Response) {
    const {
      name,
      avatar,
      whatsapp,
      bio,
      subject,
      cost,
      schedule,
    } = request.body; //destructuring of the body

    const trx = await db.transaction();
    //uses transaction to avoid saving part of the message when one of the inserts fails

    try {
      const insertedUsersIds = await trx("users").insert({
        name,
        avatar,
        whatsapp,
        bio,
      }); // insert user data int users table and saves the id of the user onto insertedUsersIds

      const user_id = insertedUsersIds[0]; // gets id[0]

      const insertedClassesIds = await trx("classes").insert({
        subject,
        cost,
        user_id,
      }); // insert class data int classes table and saves the id of the class onto insertedClassesIds

      const class_id = insertedClassesIds[0];

      const classSchedule = schedule.map((scheduleItem: ScheduleItem) => {
        return {
          class_id,
          week_day: scheduleItem.week_day,
          from: convertHourToMinutes(scheduleItem.from),
          to: convertHourToMinutes(scheduleItem.to),
        };
      }); // maps schedule data, converts it into minutes and saves onto classSchedule

      await trx("class_schedule").insert(classSchedule); // insert schedule data onto schedule table

      await trx.commit(); // commits successful transactions

      return response.status(201).send();
    } catch (err) {
      await trx.rollback(); // rollback transactions in case of error

      return response.status(400).json({
        error: "Unexpected error while creating new class",
      });
    }
  }
}
