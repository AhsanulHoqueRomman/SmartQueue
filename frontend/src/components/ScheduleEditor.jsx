const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export function ScheduleEditor({ days, onChange }) {
  const change = (index, values) => onChange(days.map((day, i) => (i === index ? { ...day, ...values } : day)));

  return (
    <div
      className="flex flex-col gap-md"
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.preventDefault();
      }}
    >
      {days.map((day, i) => (
        <fieldset key={day.day_of_week} className="card schedule-day-card">
          <legend>{weekdays[day.day_of_week]}</legend>
          <label>
            <input
              type="checkbox"
              checked={day.is_working_day}
              onChange={(e) => change(i, { is_working_day: e.target.checked })}
            />{' '}
            Working day
          </label>
          <div className="grid-responsive grid-cols-2">
            <label>
              Start
              <input
                className="form-control"
                type="time"
                required
                value={day.start_time.slice(0, 5)}
                onChange={(e) => change(i, { start_time: e.target.value + ':00' })}
              />
            </label>
            <label>
              End (by 10 PM)
              <input
                className="form-control"
                type="time"
                max="22:00"
                required
                value={day.end_time.slice(0, 5)}
                onChange={(e) => change(i, { end_time: e.target.value + ':00' })}
              />
            </label>
          </div>
          {(day.breaks || []).map((brk, index) => (
            <div key={index} className="grid-responsive grid-cols-3">
              <label>
                Break title
                <input
                  className="form-control"
                  type="text"
                  value={brk.title || ''}
                  onChange={(e) =>
                    change(i, {
                      breaks: day.breaks.map((b, n) => (n === index ? { ...b, title: e.target.value } : b)),
                    })
                  }
                />
              </label>
              {['start_time', 'end_time'].map((field) => (
                <label key={field}>
                  Break {field === 'start_time' ? 'start' : 'end'}
                  <input
                    className="form-control"
                    type="time"
                    required
                    value={brk[field].slice(0, 5)}
                    onChange={(e) =>
                      change(i, {
                        breaks: day.breaks.map((b, n) =>
                          n === index ? { ...b, [field]: e.target.value + ':00' } : b
                        ),
                      })
                    }
                  />
                </label>
              ))}
              <button
                className="btn btn-sm btn-outline"
                type="button"
                onClick={() => change(i, { breaks: day.breaks.filter((_, n) => n !== index) })}
              >
                Remove break
              </button>
            </div>
          ))}
          <button
            type="button"
            className="btn btn-sm btn-outline"
            onClick={() =>
              change(i, {
                breaks: [...(day.breaks || []), { title: '', start_time: '12:00:00', end_time: '13:00:00' }],
              })
            }
          >
            Add break
          </button>
        </fieldset>
      ))}
    </div>
  );
}
