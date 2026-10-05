import React, { useMemo } from 'react';
import { AttendanceRecord, Student } from '../../types';
import { Trophy, Medal, Award, TrendingUp, TrendingDown, Clock } from 'lucide-react';

interface TopAttendanceListProps {
  students: Student[];
  attendances: AttendanceRecord[];
  title?: string;
  limit?: number;
}

export const TopAttendanceList: React.FC<TopAttendanceListProps> = ({ 
  students, 
  attendances, 
  title = "Peringkat Kehadiran Siswa (Top 10)",
  limit = 10
}) => {
  const ranking = useMemo(() => {
    // 1. Filter students who are active
    const activeStudents = students.filter(s => s.status === 'aktif');
    
    // 2. Count attendances per student
    const stats = activeStudents.map(s => {
      const studentAttendances = attendances.filter(a => a.studentId === s.id);
      const presentCount = studentAttendances.filter(a => a.status === 'HADIR' || a.status === 'TERLAMBAT').length;
      
      // Calculate best time for HADIR
      const hadirRecords = studentAttendances.filter(a => a.status === 'HADIR');
      let bestTime = '-';
      if (hadirRecords.length > 0) {
        // Sort by time to find earliest attendance
        const sortedTimes = hadirRecords.map(r => r.time).sort();
        bestTime = sortedTimes[0];
      }

      return {
        id: s.id,
        name: s.name,
        className: s.className,
        presentCount,
        totalRecords: studentAttendances.length,
        bestTime
      };
    });

    // 3. Sort by presentCount DESC
    return stats
      .sort((a, b) => b.presentCount - a.presentCount || a.name.localeCompare(b.name))
      .slice(0, limit);
  }, [students, attendances, limit]);

  const worstRanking = useMemo(() => {
    const activeStudents = students.filter(s => s.status === 'aktif');
    const stats = activeStudents.map(s => {
      const studentAttendances = attendances.filter(a => a.studentId === s.id);
      const alpaCount = studentAttendances.filter(a => a.status === 'ALPA').length;
      return {
        id: s.id,
        name: s.name,
        className: s.className,
        alpaCount
      };
    });

    return stats
      .filter(s => s.alpaCount > 0)
      .sort((a, b) => b.alpaCount - a.alpaCount)
      .slice(0, 3);
  }, [students, attendances]);

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm overflow-hidden relative">
        <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none">
          <Trophy className="w-32 h-32 text-indigo-600 rotate-12" />
        </div>

        <div className="flex items-center justify-between mb-6 relative z-10">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-amber-50 text-amber-600 border border-amber-100 shadow-sm">
              <Trophy className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-900 tracking-tight">{title}</h3>
              <p className="text-[11px] text-slate-500 font-semibold uppercase tracking-wider">Board of Achievement</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1 bg-indigo-50 text-indigo-700 rounded-full text-[10px] font-black border border-indigo-100">
            <TrendingUp className="w-3 h-3" />
            LIVE RANKING
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 relative z-10">
          {ranking.map((s, idx) => {
            const rank = idx + 1;
            return (
              <div 
                key={s.id} 
                className={`flex items-center justify-between p-4 rounded-2xl border transition-all hover:scale-[1.01] ${
                  rank === 1 ? 'bg-gradient-to-r from-amber-50 to-white border-amber-200 shadow-amber-100/50 shadow-md ring-1 ring-amber-300/20' :
                  rank === 2 ? 'bg-gradient-to-r from-slate-50 to-white border-slate-200 shadow-sm' :
                  rank === 3 ? 'bg-gradient-to-r from-orange-50/50 to-white border-orange-100 shadow-xs' :
                  'bg-white border-slate-100 hover:border-slate-200'
                }`}
              >
                <div className="flex items-center gap-4">
                  <div className="relative shrink-0">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm shadow-inner ${
                      rank === 1 ? 'bg-amber-400 text-white' :
                      rank === 2 ? 'bg-slate-300 text-white' :
                      rank === 3 ? 'bg-orange-300 text-white' :
                      'bg-slate-100 text-slate-500'
                    }`}>
                      {rank}
                    </div>
                    {rank <= 3 && (
                      <div className="absolute -top-2 -right-2">
                        {rank === 1 ? <Medal className="w-5 h-5 text-amber-500 drop-shadow-sm" /> :
                         rank === 2 ? <Award className="w-5 h-5 text-slate-400 drop-shadow-sm" /> :
                         <Award className="w-5 h-5 text-orange-400 drop-shadow-sm" />}
                      </div>
                    )}
                  </div>
                  
                  <div className="min-w-0">
                    <h4 className="text-sm font-black text-slate-900 leading-none truncate">{s.name}</h4>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-[9px] font-bold">
                        {s.className}
                      </span>
                      <span className="flex items-center gap-1 text-[9px] text-emerald-600 font-bold">
                        <TrendingUp className="w-2.5 h-3" />
                        {s.presentCount} Hadir
                      </span>
                    </div>
                  </div>
                </div>

                <div className="text-right flex flex-col items-end gap-1 shrink-0">
                  {rank <= 3 && (
                    <span className="hidden sm:inline-block px-2 py-0.5 rounded-lg bg-indigo-600 text-white text-[8px] font-black tracking-widest uppercase">
                      EXCELLENT
                    </span>
                  )}
                  <div className="flex items-center gap-1 text-[10px] font-mono text-slate-400">
                    <Clock className="w-3 h-3" />
                    <span>Best: {s.bestTime}</span>
                  </div>
                </div>
              </div>
            );
          })}
          {ranking.length === 0 && (
            <p className="text-center py-8 text-xs text-slate-400">Belum ada data prestasi tersedia.</p>
          )}
        </div>
      </div>

      {/* Gamification: Lack of Attendance */}
      {worstRanking.length > 0 && (
        <div className="bg-rose-50 border border-rose-100 rounded-3xl p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <TrendingDown className="w-4 h-4 text-rose-500" />
            <h4 className="text-xs font-black text-rose-900 uppercase tracking-wider">Perlu Perhatian Kehadiran</h4>
          </div>
          <div className="space-y-2">
            {worstRanking.map(s => (
              <div key={s.id} className="flex items-center justify-between text-[11px] bg-white/60 p-2 rounded-xl border border-rose-100/50">
                <span className="font-bold text-slate-700 truncate mr-2">{s.name} ({s.className})</span>
                <span className="font-black text-rose-600 shrink-0">{s.alpaCount} Alpa</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
