import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { TrendingUp, TrendingDown } from 'lucide-react';

export default function StatsCard({ title, value, icon: Icon, trend, trendValue, bgColor = 'bg-emerald-500', subtitle }) {
  const isPositive = trend === 'up';

  return (
    <Card className="relative overflow-hidden border-0 shadow-lg hover:shadow-xl transition-all duration-300">
      <div className={`absolute top-0 right-0 w-32 h-32 ${bgColor} opacity-5 rounded-full -mr-16 -mt-16`} />
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="text-sm font-medium text-slate-500 mb-2">{title}</p>
            <h3 className="text-3xl font-bold text-slate-900 mb-3">{value}</h3>
            {subtitle && (
              <p className="text-xs text-slate-500 mb-2">{subtitle}</p>
            )}
            {trendValue && (
              <div className="flex items-center gap-2">
                {isPositive ? (
                  <TrendingUp className="w-4 h-4 text-emerald-600" />
                ) : (
                  <TrendingDown className="w-4 h-4 text-red-600" />
                )}
                <span className={`text-sm font-medium ${isPositive ? 'text-emerald-600' : 'text-red-600'}`}>
                  {trendValue}
                </span>
                <span className="text-xs text-slate-400">vs mes anterior</span>
              </div>
            )}
          </div>
          <div className={`p-4 ${bgColor} bg-opacity-10 rounded-2xl`}>
            <Icon className={`w-7 h-7 ${bgColor.replace('bg-', 'text-')}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}