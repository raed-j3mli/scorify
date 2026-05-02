import { motion, AnimatePresence } from 'motion/react';
import { Instagram, MoreHorizontal, Heart, MessageCircle, Send, Bookmark, User, ArrowRight, X } from 'lucide-react';
import { useState, useEffect } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import Dashboard from './Dashboard';

const InstagramProfile = () => {
  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95, y: -30, rotate: 0 }}
      animate={{ opacity: 1, scale: 1, y: 0, rotate: 2 }}
      transition={{ duration: 1, delay: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="bg-white/90 backdrop-blur-xl rounded-3xl overflow-hidden shadow-[0_30px_60px_rgba(0,0,0,0.08)] w-full max-w-[340px] border border-white p-6"
    >
      <div className="flex items-center gap-6 mb-6">
        <div className="p-[2px] rounded-full bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600 shrink-0 shadow-sm">
          <div className="bg-white p-[2px] rounded-full">
            <img 
              src="https://cdn.jsdelivr.net/gh/raed-j3mli/cool-saxophone@main/out_of_the_box.png" 
              alt="Profile" 
              className="w-16 h-16 rounded-full object-cover"
              referrerPolicy="no-referrer"
            />
          </div>
        </div>
        <div className="flex-1 flex justify-between text-center mt-1">
          <div>
            <div className="font-bold text-gray-900 text-[17px]">1</div>
            <div className="text-[13px] text-gray-500 font-medium">post</div>
          </div>
          <div>
            <div className="font-bold text-gray-900 text-[17px]">10.5k</div>
            <div className="text-[13px] text-gray-500 font-medium">followers</div>
          </div>
          <div>
            <div className="font-bold text-gray-900 text-[17px]">24</div>
            <div className="text-[13px] text-gray-500 font-medium">following</div>
          </div>
        </div>
      </div>
      <div>
        <div className="font-semibold text-gray-900 text-[15px]">OOTB Tracker</div>
        <div className="text-sm text-gray-800 mt-1.5 leading-relaxed">
          Evaluating influencers in a click. 🎯 <br/>
          Uncover true credibility and beyond.<br/>
          <a href="#" className="text-blue-600 font-medium hover:underline">#OutOfTheBox #Analytics</a>
        </div>
      </div>
      <div className="mt-6 flex gap-2">
        <button className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-900 text-[14px] font-semibold py-1.5 rounded-lg transition-colors">Following</button>
        <button className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-900 text-[14px] font-semibold py-1.5 rounded-lg transition-colors">Message</button>
      </div>
    </motion.div>
  );
};

const InstagramPost = () => {
  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95, y: 30, rotate: 0 }}
      animate={{ opacity: 1, scale: 1, y: 0, rotate: -2 }}
      transition={{ duration: 1, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="bg-white/95 backdrop-blur-xl rounded-3xl overflow-hidden shadow-[0_40px_80px_rgba(0,0,0,0.12)] w-full max-w-[360px] border border-white"
    >
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center gap-3">
          <div className="p-[2px] rounded-full bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600">
            <div className="bg-white p-[2px] rounded-full">
              <img 
                src="https://cdn.jsdelivr.net/gh/raed-j3mli/cool-saxophone@main/out_of_the_box.png" 
                alt="Profile" 
                className="w-8 h-8 rounded-full object-cover"
                referrerPolicy="no-referrer"
              />
            </div>
          </div>
          <span className="font-semibold text-[13px] text-gray-900 tracking-tight">OOTB_official</span>
        </div>
        <MoreHorizontal className="text-gray-900 w-5 h-5 cursor-pointer" />
      </div>
      <div className="aspect-square bg-gray-50 relative overflow-hidden">
        <img 
          src="https://cdn.jsdelivr.net/gh/raed-j3mli/cool-saxophone@main/out_of_the_box.png" 
          alt="Post content" 
          className="w-full h-full object-cover"
          referrerPolicy="no-referrer"
        />
      </div>
      <div className="px-4 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Heart className="w-[26px] h-[26px] text-gray-900 cursor-pointer hover:text-gray-600 transition-colors" strokeWidth={1.5} />
          <MessageCircle className="w-[26px] h-[26px] text-gray-900 cursor-pointer hover:text-gray-600 transition-colors" strokeWidth={1.5} style={{ transform: 'scaleX(-1)' }} />
          <Send className="w-[26px] h-[26px] text-gray-900 cursor-pointer hover:text-gray-600 transition-colors" strokeWidth={1.5} />
        </div>
        <Bookmark className="w-[26px] h-[26px] text-gray-900 cursor-pointer hover:text-gray-600 transition-colors" strokeWidth={1.5} />
      </div>
    </motion.div>
  );
};

function LandingPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [cookie, setCookie] = useState('');
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [brandInput, setBrandInput] = useState({
    productCategory: 'Fashion',
    campaignGoal: 'Engagement',
    brandPositioning: 'Mass Market',
    productPrice: '',
    brandDescription: '',
  });
  const navigate = useNavigate();

  useEffect(() => {
    const storedCookie = localStorage.getItem('ig_cookie') || '';
    setCookie(storedCookie);
  }, []);

  useEffect(() => {
    if (query.length < 3) {
      setResults([]);
      setShowDropdown(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    setShowDropdown(true);
    const timer = setTimeout(() => { fetchResults(query); }, 800);
    return () => clearTimeout(timer);
  }, [query]);

  const fetchResults = async (q: string) => {
    setLoading(true);
    try {
      const res = await fetch('/api/playwright-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q, cookie })
      });
      const data = await res.json();
      if (data.users && data.users.length > 0) {
        setResults(data.users.map((u: any) => u.user));
        setShowDropdown(true);
      } else {
        setResults([]);
        setShowDropdown(false);
      }
    } catch(err) {
      console.error('Fetch error:', err);
      setResults([]);
      setShowDropdown(false);
    } finally {
      setLoading(false);
    }
  };

  const handleUserSelect = (user: any) => {
    setQuery(user.username);
    setShowDropdown(false);
    setResults([]);
    setSelectedUser(user);
  };

  const handleAnalyze = () => {
    if (!selectedUser || !brandInput.productPrice || !brandInput.brandDescription.trim()) return;
    navigate(`/dashboard/${selectedUser.username}`, {
      state: { isVerified: selectedUser.is_verified, brandInput }
    });
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.3 }}
      className="relative min-h-[100dvh] w-full md:h-[100dvh] md:overflow-hidden overflow-x-hidden overflow-y-auto bg-[#C9D1D9] font-sans selection:bg-black selection:text-white"
    >
      {/* Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
        <div className="absolute top-[-20%] right-[-10%] w-[70vw] h-[70vw] bg-white rounded-full blur-[150px] opacity-60"></div>
        <div className="absolute bottom-[-10%] left-[-10%] w-[50vw] h-[50vw] bg-sky-200 rounded-full blur-[120px] opacity-40"></div>
        <div className="absolute top-[20%] left-[20%] w-[100vw] h-[20vw] bg-white rounded-full blur-[80px] transform -rotate-45 opacity-30"></div>
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[#B0BAC3]/50 mix-blend-multiply"></div>
      </div>

      <main className="relative z-40 flex flex-col md:flex-row items-center md:items-start justify-between h-full min-h-[calc(100vh-90px)] px-8 md:px-16 lg:px-24 gap-12 pt-8 md:pt-[6vh] lg:pt-[10vh] xl:pt-[12vh] pb-16 md:pb-0">
        <div className="w-full md:w-1/2 max-w-xl self-center md:self-start mt-4 md:mt-0 relative z-50">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          >
            <h1 className="text-5xl md:text-6xl lg:text-[72px] font-medium leading-[1.05] tracking-tight text-gray-900 mb-8">
              Evaluate influencers <br />
              <span className="text-white drop-shadow-md">in a click.</span>
            </h1>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4, ease: "easeOut" }}
            className="relative"
          >
            {/* Search input */}
            <div className="relative flex items-center max-w-md group z-50">
              <div className="absolute left-5 text-gray-500 z-20 pointer-events-none group-focus-within:text-gray-900 transition-colors">
                <Instagram size={22} strokeWidth={1.5} />
              </div>
              <input
                type="text"
                placeholder="Enter Instagram username"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  if (selectedUser && e.target.value !== selectedUser.username) setSelectedUser(null);
                  if (e.target.value.length < 3) { setShowDropdown(false); setResults([]); }
                }}
                onFocus={() => { if (results.length > 0) setShowDropdown(true); }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && query.trim().length > 0) {
                    handleUserSelect({ username: query.trim(), is_verified: false });
                  }
                }}
                className="w-full pl-14 pr-8 py-4 bg-white/40 border border-white/50 backdrop-blur-xl rounded-full outline-none focus:bg-white/70 focus:ring-4 focus:ring-white/30 transition-all text-gray-900 placeholder-gray-500 text-lg shadow-[0_8px_30px_rgb(0,0,0,0.04)]"
              />

              <AnimatePresence>
                {showDropdown && (results.length > 0 || loading) && (
                  <motion.div
                    initial={{ opacity: 0, y: 5, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 5, scale: 0.98 }}
                    transition={{ duration: 0.2, ease: "easeOut" }}
                    className="absolute top-[calc(100%+8px)] left-0 w-full bg-white/80 backdrop-blur-2xl border border-white/60 rounded-3xl shadow-[0_20px_40px_rgba(0,0,0,0.08)] overflow-hidden z-[100] flex flex-col max-h-[240px]"
                  >
                    <div className="p-2 overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-300 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-gray-400 pb-2">
                      {loading && results.length === 0 ? (
                        Array.from({ length: 3 }).map((_, idx) => (
                          <div key={`skeleton-${idx}`} className="flex items-center gap-4 p-3 animate-pulse">
                            <div className="w-12 h-12 rounded-full bg-gray-200 shrink-0"></div>
                            <div className="flex-1 space-y-2">
                              <div className="h-3.5 bg-gray-200 rounded w-1/3"></div>
                              <div className="h-2.5 bg-gray-200 rounded w-1/4"></div>
                            </div>
                          </div>
                        ))
                      ) : (
                        results.map((user: any, idx: number) => (
                          <div
                            key={user.pk_id || user.pk || idx}
                            onClick={() => handleUserSelect(user)}
                            className="flex items-center gap-4 p-3 hover:bg-white/60 rounded-2xl cursor-pointer transition-all duration-200"
                          >
                            <div className="w-12 h-12 rounded-full overflow-hidden bg-gray-100 shrink-0 border border-gray-200 relative">
                              {user.hd_profile_pic_url_info?.url || user.profile_pic_url ? (
                                <img
                                  src={`/api/image?url=${encodeURIComponent(user.hd_profile_pic_url_info?.url || user.profile_pic_url)}`}
                                  alt={user.username}
                                  className="w-full h-full object-cover"
                                  referrerPolicy="no-referrer"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-gray-400">
                                  <User className="w-6 h-6" />
                                </div>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <h4 className="font-bold text-gray-900 truncate text-[15px]">{user.username}</h4>
                                {user.is_verified && (
                                  <div className="bg-blue-500 text-white p-[2px] rounded-full shrink-0">
                                    <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                                      <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                                    </svg>
                                  </div>
                                )}
                              </div>
                              {user.full_name && (
                                <p className="text-[13px] text-gray-500 truncate mt-0.5">{user.full_name}</p>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Brand form — appears after selecting an influencer */}
            <AnimatePresence>
              {selectedUser && (
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  transition={{ duration: 0.3, ease: 'easeOut' }}
                  className="mt-4 max-w-md"
                >
                  {/* Selected influencer chip */}
                  <div className="flex items-center gap-2 mb-3">
                    <div className="flex items-center gap-2 bg-white/60 backdrop-blur-md border border-white/70 rounded-full px-3 py-1.5">
                      <div className="w-5 h-5 rounded-full bg-gray-200 overflow-hidden shrink-0">
                        {(selectedUser.hd_profile_pic_url_info?.url || selectedUser.profile_pic_url) && (
                          <img src={`/api/image?url=${encodeURIComponent(selectedUser.hd_profile_pic_url_info?.url || selectedUser.profile_pic_url)}`} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        )}
                      </div>
                      <span className="text-sm font-semibold text-gray-900">@{selectedUser.username}</span>
                    </div>
                    <button
                      onClick={() => { setSelectedUser(null); setQuery(''); }}
                      className="w-7 h-7 flex items-center justify-center rounded-full bg-white/50 hover:bg-white/80 transition-colors"
                    >
                      <X size={14} className="text-gray-600" />
                    </button>
                  </div>

                  {/* Campaign fields */}
                  <div className="bg-white/60 backdrop-blur-xl border border-white/70 rounded-3xl p-5 shadow-[0_8px_30px_rgba(0,0,0,0.06)] space-y-3">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-gray-500 font-medium">Campaign Setup</div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] text-gray-500 uppercase tracking-wider mb-1 block">Product Category</label>
                        <select value={brandInput.productCategory} onChange={e => setBrandInput(p => ({...p, productCategory: e.target.value}))} className="w-full bg-white/70 border border-white/80 text-gray-900 text-sm rounded-xl px-3 py-2 outline-none focus:bg-white focus:border-gray-300">
                          {['Beauty','Fashion','Tech','Food','Travel','Fitness','Gaming','Finance','Home','Education'].map(c => <option key={c}>{c}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-[11px] text-gray-500 uppercase tracking-wider mb-1 block">Campaign Goal</label>
                        <select value={brandInput.campaignGoal} onChange={e => setBrandInput(p => ({...p, campaignGoal: e.target.value}))} className="w-full bg-white/70 border border-white/80 text-gray-900 text-sm rounded-xl px-3 py-2 outline-none focus:bg-white focus:border-gray-300">
                          {['Awareness','Conversion','Engagement','Retention'].map(c => <option key={c}>{c}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] text-gray-500 uppercase tracking-wider mb-1 block">Brand Positioning</label>
                        <select value={brandInput.brandPositioning} onChange={e => setBrandInput(p => ({...p, brandPositioning: e.target.value}))} className="w-full bg-white/70 border border-white/80 text-gray-900 text-sm rounded-xl px-3 py-2 outline-none focus:bg-white focus:border-gray-300">
                          {['Luxury','Premium','Mass Market','Budget'].map(c => <option key={c}>{c}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-[11px] text-gray-500 uppercase tracking-wider mb-1 block">Product Price ($)</label>
                        <input type="number" min="0" placeholder="e.g. 49" value={brandInput.productPrice} onChange={e => setBrandInput(p => ({...p, productPrice: e.target.value}))} className="w-full bg-white/70 border border-white/80 text-gray-900 text-sm rounded-xl px-3 py-2 outline-none focus:bg-white focus:border-gray-300 placeholder-gray-400" />
                      </div>
                    </div>
                    <div>
                      <label className="text-[11px] text-gray-500 uppercase tracking-wider mb-1 block">Brand Description</label>
                      <textarea rows={2} placeholder="e.g. A luxury skincare brand targeting women 25-35 who value clean ingredients..." value={brandInput.brandDescription} onChange={e => setBrandInput(p => ({...p, brandDescription: e.target.value}))} className="w-full bg-white/70 border border-white/80 text-gray-900 text-sm rounded-xl px-3 py-2 outline-none focus:bg-white focus:border-gray-300 placeholder-gray-400 resize-none" />
                    </div>
                    <button
                      onClick={handleAnalyze}
                      disabled={!brandInput.productPrice || !brandInput.brandDescription.trim()}
                      className="w-full flex items-center justify-center gap-2 bg-gray-900 hover:bg-black text-white font-semibold text-sm py-3 rounded-2xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Analyze Influencer <ArrowRight size={16} />
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>

        {/* Right Side - UI Components */}
        <div className="w-full md:w-1/2 flex justify-center md:justify-end items-start relative h-auto perspective-[1000px] pointer-events-none mt-8 md:mt-0 xl:mr-12 z-30">
          <div className="absolute inset-0 bg-gradient-to-tr from-sky-200/40 to-white/60 blur-[100px] -z-10 rounded-full transform scale-150"></div>
          <div className="relative w-full max-w-[440px] h-[520px] hidden md:block scale-[0.85] lg:scale-95 xl:scale-100 origin-top">
            <div className="absolute right-0 top-0 z-10 w-full flex justify-end">
              <div className="pointer-events-auto w-full flex justify-end"><InstagramProfile /></div>
            </div>
            <div className="absolute left-0 lg:-left-12 bottom-0 z-20 w-full flex justify-start">
              <div className="pointer-events-auto"><InstagramPost /></div>
            </div>
          </div>
          <div className="flex flex-col gap-6 items-center md:hidden w-full relative z-20 pointer-events-auto pb-8">
            <InstagramProfile />
            <InstagramPost />
          </div>
        </div>
      </main>
    </motion.div>
  );
}

export default function App() {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait">
      {/* @ts-ignore - needed for AnimatePresence */}
      <Routes location={location} key={location.pathname}>
        <Route path="/" element={<LandingPage />} />
        <Route path="/dashboard/:username" element={<Dashboard />} />
      </Routes>
    </AnimatePresence>
  );
}
