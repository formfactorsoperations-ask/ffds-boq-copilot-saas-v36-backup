with open('./components/InteractiveBoqEditor.tsx', 'r') as f:
    content = f.read()

# Fix All Rooms card
content = content.replace(
"""            className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition-all border text-left min-w-[200px] shrink-0 ${
              selectedRoomId === 'All Rooms'
                ? 'bg-slate-900 border-slate-900 text-white shadow-md'
                : 'bg-slate-50 border-transparent hover:bg-slate-100/80 hover:border-slate-200 text-slate-700'
            }`}
          >
            <div className={`p-2 rounded-lg shrink-0 ${selectedRoomId === 'All Rooms' ? 'bg-white/10 text-amber-400' : 'bg-white text-[#0066CC] shadow-sm'}`}>""",
"""            className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition-all border text-left min-w-[200px] shrink-0 ${
              selectedRoomId === 'All Rooms'
                ? 'bg-slate-900 border-slate-900 text-white shadow-md'
                : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm text-slate-700'
            }`}
          >
            <div className={`p-2 rounded-lg shrink-0 ${selectedRoomId === 'All Rooms' ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-600 shadow-sm'}`}>"""
)

content = content.replace(
"""              <div className={`text-xs font-black truncate ${selectedRoomId === 'All Rooms' ? 'text-white' : 'text-slate-900'}`}>
                All Rooms combined
              </div>
              <div className="flex justify-between items-center mt-0.5">
                <span className={`text-[9px] font-bold ${selectedRoomId === 'All Rooms' ? 'text-slate-300' : 'text-slate-500'}`}>
                  {items.filter(i => i.boqStatus !== 'deleted' && i.boqStatus !== 'excluded').length} items
                </span>
                <span className={`text-xs font-mono font-black ${selectedRoomId === 'All Rooms' ? 'text-amber-400' : 'text-[#0066CC]'}`}>
                  {formatCurrency(projectStats.grandTotal)}
                </span>""",
"""              <div className={`text-xs font-black truncate ${selectedRoomId === 'All Rooms' ? 'text-white' : 'text-slate-900 group-hover:text-slate-900'}`}>
                All Rooms combined
              </div>
              <div className="flex justify-between items-center mt-0.5">
                <span className={`text-[9px] font-bold ${selectedRoomId === 'All Rooms' ? 'text-slate-300' : 'text-slate-500'}`}>
                  {items.filter(i => i.boqStatus !== 'deleted' && i.boqStatus !== 'excluded').length} items
                </span>
                <span className={`text-xs font-mono font-black ${selectedRoomId === 'All Rooms' ? 'text-white' : 'text-slate-800'}`}>
                  {formatCurrency(projectStats.grandTotal)}
                </span>"""
)

# Fix Room Cards
content = content.replace(
"""                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition-all border text-left min-w-[200px] shrink-0 group ${
                  isActive
                    ? 'bg-[#0066CC] border-[#0066CC] text-white shadow-md'
                    : 'bg-white border-slate-100 hover:border-slate-300 hover:shadow-sm text-slate-700'
                }`}
              >
                <div className={`p-2 rounded-lg shrink-0 transition-colors ${
                  isActive 
                    ? 'bg-white/15 text-white' 
                    : 'bg-sky-50 text-[#0066CC] group-hover:bg-sky-100'
                }`}>""",
"""                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition-all border text-left min-w-[200px] shrink-0 group ${
                  isActive
                    ? 'bg-slate-900 border-slate-900 text-white shadow-md'
                    : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm text-slate-700'
                }`}
              >
                <div className={`p-2 rounded-lg shrink-0 transition-colors ${
                  isActive 
                    ? 'bg-white/15 text-white' 
                    : 'bg-slate-100 text-slate-600 group-hover:bg-slate-200'
                }`}>"""
)

content = content.replace(
"""                  <div className="flex justify-between items-center mt-0.5">
                    <span className={`text-[9px] font-bold ${isActive ? 'text-sky-100' : 'text-slate-400'}`}>
                      {stats.count} items • {room.size} {room.unit}
                    </span>""",
"""                  <div className="flex justify-between items-center mt-0.5">
                    <span className={`text-[9px] font-bold ${isActive ? 'text-slate-300' : 'text-slate-400'}`}>
                      {stats.count} items • {room.size} {room.unit}
                    </span>"""
)

# Fix Unassigned Card
content = content.replace(
"""              className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition-all border text-left min-w-[200px] shrink-0 ${
                selectedRoomId === 'Unassigned'
                  ? 'bg-amber-600 border-amber-600 text-white shadow-md'
                  : 'bg-amber-50 border-amber-150 hover:bg-amber-100 text-amber-900'
              }`}
            >
              <div className={`p-2 rounded-lg shrink-0 ${
                selectedRoomId === 'Unassigned' ? 'bg-white/15 text-white' : 'bg-amber-150 text-amber-700'
              }`}>""",
"""              className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition-all border text-left min-w-[200px] shrink-0 ${
                selectedRoomId === 'Unassigned'
                  ? 'bg-slate-900 border-slate-900 text-white shadow-md'
                  : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm text-slate-700'
              }`}
            >
              <div className={`p-2 rounded-lg shrink-0 ${
                selectedRoomId === 'Unassigned' ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-600'
              }`}>"""
)

content = content.replace(
"""              <div className="min-w-0 flex-grow">
                <div className="text-xs font-black truncate">Unassigned Items</div>
                <div className="flex justify-between items-center mt-0.5">
                  <span className="text-[9px] font-bold">
                    {roomStats['Unassigned'].count} items
                  </span>
                  <span className="text-xs font-mono font-black">
                    {formatCurrency(roomStats['Unassigned'].total)}
                  </span>
                </div>
              </div>""",
"""              <div className="min-w-0 flex-grow">
                <div className={`text-xs font-black truncate ${selectedRoomId === 'Unassigned' ? 'text-white' : 'text-slate-900'}`}>Unassigned Items</div>
                <div className="flex justify-between items-center mt-0.5">
                  <span className={`text-[9px] font-bold ${selectedRoomId === 'Unassigned' ? 'text-slate-300' : 'text-slate-400'}`}>
                    {roomStats['Unassigned'].count} items
                  </span>
                  <span className={`text-xs font-mono font-black ${selectedRoomId === 'Unassigned' ? 'text-white' : 'text-slate-800'}`}>
                    {formatCurrency(roomStats['Unassigned'].total)}
                  </span>
                </div>
              </div>"""
)

with open('./components/InteractiveBoqEditor.tsx', 'w') as f:
    f.write(content)
