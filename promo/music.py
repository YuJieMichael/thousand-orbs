import numpy as np, scipy.io.wavfile as wf
SR=44100; T=38.5; N=int(SR*T); BPM=128; B=60/BPM
L=np.zeros(N); R=np.zeros(N)
rng=np.random.default_rng(7)
def add(sig,t,pan=0.0,g=1.0):
    i=int(t*SR); 
    if i>=N: return
    s=sig[:N-i]*g; L[i:i+len(s)]+=s*(1-pan)*.5*2**.5*.71; R[i:i+len(s)]+=s*(1+pan)*.5*2**.5*.71
def env(n,a,d):
    t=np.arange(n)/SR; e=np.minimum(1,t/max(a,1e-4))*np.exp(-t/d); return e
def hz(m): return 440*2**((m-69)/12)
def kick():
    n=int(.35*SR); t=np.arange(n)/SR; f=48+90*np.exp(-t*30); ph=2*np.pi*np.cumsum(f)/SR
    return np.sin(ph)*np.exp(-t*9)*1.0 + rng.standard_normal(n)*np.exp(-t*300)*.15
def hat(open_=False):
    n=int((.18 if open_ else .05)*SR); x=rng.standard_normal(n); x=np.diff(np.concatenate([[0],x]))
    return x*env(n,.001,.06 if open_ else .015)*.22
def clap():
    n=int(.25*SR); x=rng.standard_normal(n); t=np.arange(n)/SR
    e=sum(np.exp(-np.maximum(0,t-d)*60)*(t>=d) for d in (0,.01,.022))*.4+np.exp(-t*14)*.5
    # bandpass-ish
    from scipy.signal import butter,lfilter
    b,a=butter(2,[900/(SR/2),3500/(SR/2)],'band'); return lfilter(b,a,x)*e*.9
def pluck(m,dur=.3,bright=1.0):
    n=int(dur*SR); t=np.arange(n)/SR; f=hz(m)
    s=sum(np.sin(2*np.pi*f*k*t)*(bright**(k-1))/k for k in range(1,7))
    return s*env(n,.002,.12)*.28
def bell(m,dur=1.2):
    n=int(dur*SR); t=np.arange(n)/SR; f=hz(m)
    s=np.sin(2*np.pi*f*t+1.8*np.sin(2*np.pi*f*3.5*t)*np.exp(-t*4))
    return s*env(n,.002,.35)*.25
def bass(m,dur):
    n=int(dur*SR); t=np.arange(n)/SR; f=hz(m)
    s=np.sin(2*np.pi*f*t)+.35*np.sin(2*np.pi*2*f*t)
    return s*np.minimum(1,t/.005)*np.minimum(1,(dur-t)/.03)*.42
def pad(ms,dur):
    n=int(dur*SR); t=np.arange(n)/SR; s=np.zeros(n)
    for m in ms:
        for dt in (-.08,.08):
            f=hz(m)*2**(dt/12); s+=2*((t*f)%1)-1
    from scipy.signal import butter,lfilter
    b,a=butter(2,1800/(SR/2)); s=lfilter(b,a,s)
    e=np.minimum(1,t/.25)*np.minimum(1,(dur-t)/.3); return s*e*.035
# chords: Am F C G  (roots midi)
prog=[(57,[69,72,76]),(53,[65,69,72]),(48,[67,72,76]),(55,[67,71,74])]
bar=4*B; start=1.6  # groove starts after the title hit
nb=int((T-start)/bar)+1
for k in range(nb):
    t0=start+k*bar; root,ch=prog[k%4]
    add(pad(ch,bar),t0,0,1)
    for q in range(8):
        tq=t0+q*B/2
        add(bass(root-12 if q%2==0 else root,B/2*.9),tq,0,1)
    ending = t0>=34.5
    for q in range(4):
        tb=t0+q*B
        if not ending or q==0: add(kick(),tb,0,.9)
        if q in (1,3) and not ending: add(clap(),tb,0,.55)
        add(hat(),tb+B/2,.3,1); add(hat(),tb+B/4*3,-.3,.6)
    # arp
    arp=[ch[0]+12,ch[1]+12,ch[2]+12,ch[1]+12]
    for q in range(16):
        tq=t0+q*B/4; m=arp[q%4]+(12 if q in (14,) else 0)
        add(pluck(m,.25,.55),tq,(-.4 if q%2 else .4),.75 if k>0 else .45)
# intro: riser + impact + bell
n=int(1.6*SR); t=np.arange(n)/SR
riser=rng.standard_normal(n)*(t/1.6)**2*.12
add(riser,0,0,1)
imp=kick()*1.3; add(imp,0.05,0,1)
for m,d in ((81,0.05),(88,0.05),(93,0.05)): add(bell(m,2.0),d,0,.9)
# transition sfx: coin sparkle + whoosh
from scipy.signal import butter,lfilter
def whoosh(d=.5):
    n=int(d*SR); t=np.arange(n)/SR; x=rng.standard_normal(n)
    b,a=butter(2,[600/(SR/2),5000/(SR/2)],'band'); x=lfilter(b,a,x)
    return x*np.sin(np.pi*t/d)**2*.35
def coins():
    s=np.zeros(int(.6*SR))
    for j in range(6):
        b=bell(96+rng.integers(-3,4),.5)[:len(s)-int(j*.05*SR)]; i=int(j*.05*SR); s[i:i+len(b)]+=b*.5
    return s
for tx in (13.8,15.9,26.5,31.1,34.7):
    add(whoosh(),tx-.25,0,1); add(coins(),tx,0,.7)
# end chord
add(bell(81,3),34.7,0,.8); add(bell(76,3),34.75,-.2,.6); add(bell(84,3),34.8,.2,.6)
x=np.stack([L,R],1)
# master fade + soft clip
x[:int(.02*SR)]*=np.linspace(0,1,int(.02*SR))[:,None]
fo=int(2.0*SR); x[-fo:]*=np.linspace(1,0,fo)[:,None]
x=np.tanh(x*1.4)/np.tanh(1.4); x/=np.abs(x).max()*1.12
wf.write('music.wav',SR,(x*32767).astype(np.int16)); print('ok')
