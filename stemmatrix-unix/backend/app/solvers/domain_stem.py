"""Deterministic physics, chemistry, engineering and unit-conversion solvers.

All inputs are explicit. Results include formula/assumption metadata; they are educational
calculations and not a substitute for validated safety-critical design tools.
"""
from __future__ import annotations
import math, re
from typing import Any
import numpy as np
import sympy as sp
from app.schemas.models import SolverRequest, SolverResponse, VerificationResult

ATOMIC_WEIGHTS = {
'H':1.008,'He':4.002602,'Li':6.94,'Be':9.0121831,'B':10.81,'C':12.011,'N':14.007,'O':15.999,'F':18.998403,'Ne':20.1797,
'Na':22.989769,'Mg':24.305,'Al':26.981538,'Si':28.085,'P':30.973762,'S':32.06,'Cl':35.45,'Ar':39.948,'K':39.0983,'Ca':40.078,
'Sc':44.955908,'Ti':47.867,'V':50.9415,'Cr':51.9961,'Mn':54.938044,'Fe':55.845,'Co':58.933194,'Ni':58.6934,'Cu':63.546,'Zn':65.38,
'Ga':69.723,'Ge':72.630,'As':74.921595,'Se':78.971,'Br':79.904,'Kr':83.798,'Rb':85.4678,'Sr':87.62,'Y':88.90584,'Zr':91.224,
'Nb':92.90637,'Mo':95.95,'Ru':101.07,'Rh':102.9055,'Pd':106.42,'Ag':107.8682,'Cd':112.414,'In':114.818,'Sn':118.710,'Sb':121.760,
'Te':127.60,'I':126.90447,'Xe':131.293,'Cs':132.90545,'Ba':137.327,'La':138.90547,'Ce':140.116,'W':183.84,'Pt':195.084,'Au':196.96657,
'Hg':200.592,'Tl':204.38,'Pb':207.2,'Bi':208.9804,'U':238.02891,
}

def convert_units(value, from_unit, to_unit, interval=False):
    """Convert between compatible units using the shared unit parser (dimension-checked)."""
    from app.inputs.units import UnitError, convert, parse_unit
    try: val=float(value)
    except (TypeError,ValueError) as e: raise ValueError('value must be numeric') from e
    notes=[]
    fu=parse_unit(str(from_unit),notes=notes); tu=parse_unit(str(to_unit),expected=fu.dim,notes=notes)
    out=convert(val,str(from_unit),str(to_unit),delta=interval)
    if not math.isfinite(out): raise ValueError('Conversion result is non-finite')
    res={'value':out,'unit':str(to_unit).strip(),'dimension':fu.dim.name(),'input_value':val,'input_unit':str(from_unit).strip()}
    if notes: res['notes']=notes
    return res

def _p(r,k,default=None): return r.extra_params.get(k,default)
def _nums(r,*keys):
    out={}
    for k in keys:
        v=_p(r,k)
        if v is None: raise ValueError(f'Missing required extra_params.{k}')
        if isinstance(v,bool): raise ValueError(f'extra_params.{k} must be numeric, not a boolean')
        try: v=float(v)
        except (TypeError,ValueError) as e: raise ValueError(f'extra_params.{k} must be numeric') from e
        if not math.isfinite(v): raise ValueError(f'extra_params.{k} must be finite')
        out[k]=v
    return out

def _resp(r,result,details=None,passed=True,message='Formula evaluated; input assumptions must hold'):
    numeric=float(result) if isinstance(result,(int,float,np.number)) and math.isfinite(float(result)) else None
    return SolverResponse(request_id=r.request_id,status='success',solver=r.solver,result=result,exact_result=str(result) if not isinstance(result,dict) else None,numeric_result=numeric,details=details or {},verification=VerificationResult(passed=bool(passed),message=message))

def formula_counts(formula: str) -> dict[str,int]:
    """Element counts of a formula such as Fe2(SO4)3 or CuSO4.5H2O (hydrate parts after '.')."""
    from app.inputs.notation import normalize_chemical_formula, NotationError
    try: f=normalize_chemical_formula(formula)
    except NotationError as e: raise ValueError(str(e)) from e
    total: dict[str,int]={}
    for part in f.split('.'):
        m=re.match(r'^(\d+)(?=[A-Z(])',part); mult=1
        if m: mult=int(m.group(1)); part=part[m.end():]
        if not part: raise ValueError(f'Empty part in formula {formula!r}')
        toks=re.findall(r'([A-Z][a-z]?|\(|\)|\d+)',part)
        if ''.join(toks)!=part: raise ValueError(f'Unsupported formula notation in {part!r}; use element symbols, digit subscripts, parentheses and hydrate dots')
        def group(i=0,nested=False):
            d={}
            while i<len(toks):
                t=toks[i]
                if t==')':
                    if not nested: raise ValueError('Unmatched closing parenthesis')
                    return d,i+1
                if t=='(':
                    sub,i=group(i+1,True); k=1
                    if i<len(toks) and toks[i].isdigit(): k=int(toks[i]); i+=1
                    for e,c in sub.items(): d[e]=d.get(e,0)+c*k
                    continue
                if t.isdigit(): raise ValueError(f'Unexpected number {t} in formula {formula!r}')
                if t not in ATOMIC_WEIGHTS: raise ValueError(f'Unknown/unsupported element: {t}')
                i+=1; k=1
                if i<len(toks) and toks[i].isdigit(): k=int(toks[i]); i+=1
                if k==0: raise ValueError('Subscript 0 is not valid in a formula')
                d[t]=d.get(t,0)+k
            if nested: raise ValueError('Unmatched opening parenthesis')
            return d,i
        counts,end=group()
        if end!=len(toks): raise ValueError('Could not parse complete formula')
        for e,c in counts.items(): total[e]=total.get(e,0)+c*mult
    return total

class DomainSTEMSolver:
    name='domain_stem'
    operations={
      'unit_convert','physics_kinematics','physics_force','physics_weight','physics_kinetic_energy','physics_potential_energy','physics_momentum','physics_density','physics_pressure','physics_ohms_law','physics_electrical_power','physics_wave_speed','physics_ideal_gas','physics_work','physics_hydrostatic_pressure','physics_heat_energy',
      'chemistry_molar_mass','chemistry_molarity','chemistry_dilution','chemistry_ideal_gas','chemistry_ph','chemistry_balance_equation','chemistry_stoichiometry',
      'engineering_reynolds','engineering_heat_transfer','engineering_efficiency','engineering_voltage_divider','engineering_bending_stress','engineering_flow_rate','engineering_safety_factor'}
    def solve(self,r):
      try:
        op=r.solver; p=r.extra_params
        if op=='unit_convert':
          q=_nums(r,'value'); return _resp(r,convert_units(q['value'],p.get('from_unit',''),p.get('to_unit',''),bool(p.get('interval',False))),{ 'dimension_check':'passed'})
        if op=='physics_kinematics':
          u,v,a,t,s=(_p(r,k) for k in ('initial_velocity','final_velocity','acceleration','time','displacement'))
          cand=[]
          if v is None and all(z is not None for z in (u,a,t)): cand.append(('final_velocity',float(u)+float(a)*float(t),'v = u + a*t'))
          if u is None and all(z is not None for z in (v,a,t)): cand.append(('initial_velocity',float(v)-float(a)*float(t),'u = v - a*t'))
          if a is None and all(z is not None for z in (v,u,t)) and float(t)!=0: cand.append(('acceleration',(float(v)-float(u))/float(t),'a = (v-u)/t'))
          if t is None and all(z is not None for z in (v,u,a)) and float(a)!=0: cand.append(('time',(float(v)-float(u))/float(a),'t = (v-u)/a'))
          if s is None and all(z is not None for z in (u,a,t)): cand.append(('displacement',float(u)*float(t)+.5*float(a)*float(t)**2,'s = u*t + 0.5*a*t^2'))
          if not cand: raise ValueError('Provide inputs sufficient to solve one missing kinematics quantity')
          target=_p(r,'target'); chosen=next((c for c in cand if c[0]==target),cand[0]); return _resp(r,{'quantity':chosen[0],'value':chosen[1]},{'formula':chosen[2],'assumption':'constant acceleration; consistent units required'})
        if op=='physics_force':
          q=_nums(r,'mass','acceleration'); val=q['mass']*q['acceleration']; return _resp(r,val,{'formula':'F=m*a','unit':'N','residual':abs(val-q['mass']*q['acceleration'])})
        if op=='physics_weight':
          q=_nums(r,'mass'); g=float(_p(r,'gravity',9.80665)); return _resp(r,q['mass']*g,{'formula':'W=m*g','unit':'N','gravity_m_s2':g})
        if op in ('physics_kinetic_energy','physics_momentum'):
          q=_nums(r,'mass','velocity'); val=.5*q['mass']*q['velocity']**2 if op=='physics_kinetic_energy' else q['mass']*q['velocity']; return _resp(r,val,{'formula':'KE=0.5*m*v^2' if op=='physics_kinetic_energy' else 'p=m*v','unit':'J' if op=='physics_kinetic_energy' else 'kg*m/s'})
        if op=='physics_potential_energy':
          q=_nums(r,'mass','height'); g=float(_p(r,'gravity',9.80665)); return _resp(r,q['mass']*g*q['height'],{'formula':'PE=m*g*h','unit':'J'})
        if op=='physics_density':
          q=_nums(r,'mass','volume');
          if q['volume']<=0: raise ValueError('volume must be positive')
          return _resp(r,q['mass']/q['volume'],{'formula':'rho=m/V','unit':'kg/m^3'})
        if op=='physics_pressure':
          q=_nums(r,'force','area');
          if q['area']<=0: raise ValueError('area must be positive')
          return _resp(r,q['force']/q['area'],{'formula':'P=F/A','unit':'Pa'})
        if op=='physics_ohms_law':
          d={k:_p(r,k) for k in ('voltage','current','resistance')}; missing=[k for k,v in d.items() if v is None]
          if len(missing)!=1: raise ValueError('Provide exactly two of voltage, current, resistance')
          v,i,rr=(float(d[k]) if d[k] is not None else None for k in ('voltage','current','resistance'))
          if missing[0]=='voltage': name,val,form='voltage',i*rr,'V=I*R'
          elif missing[0]=='current':
            if rr==0: raise ValueError('resistance must be non-zero')
            name,val,form='current',v/rr,'I=V/R'
          else:
            if i==0: raise ValueError('current must be non-zero')
            name,val,form='resistance',v/i,'R=V/I'
          return _resp(r,{'quantity':name,'value':val},{'formula':form})
        if op=='physics_electrical_power':
          v,i,rr=(_p(r,k) for k in ('voltage','current','resistance'))
          if v is not None and i is not None: val=float(v)*float(i); form='P=V*I'
          elif i is not None and rr is not None: val=float(i)**2*float(rr); form='P=I^2*R'
          elif v is not None and rr is not None:
            if float(rr)==0: raise ValueError('resistance must be non-zero')
            val=float(v)**2/float(rr); form='P=V^2/R'
          else: raise ValueError('Provide voltage and current, current and resistance, or voltage and resistance')
          return _resp(r,val,{'formula':form,'unit':'W'})
        if op=='physics_wave_speed':
          q=_nums(r,'frequency','wavelength'); return _resp(r,q['frequency']*q['wavelength'],{'formula':'v=f*lambda','unit':'m/s'})
        if op=='physics_ideal_gas':
          q=_nums(r,'pressure','volume','moles','temperature');
          if min(q['volume'],q['moles'],q['temperature'])<=0: raise ValueError('volume, moles, and absolute temperature must be positive')
          R=float(_p(r,'gas_constant',8.31446261815324)); lhs=q['pressure']*q['volume']; rhs=q['moles']*R*q['temperature']; residual=lhs-rhs; rel=abs(residual)/max(abs(lhs),abs(rhs),1.0)
          return _resp(r,{'PV':lhs,'nRT':rhs},{'formula':'P*V=n*R*T','residual':residual,'relative_residual':rel,'units':'Pa, m^3, mol, K'},rel<=1e-6,'Ideal-gas equality residual checked; SI units required')
        if op=='physics_work':
          q=_nums(r,'force','displacement'); val=q['force']*q['displacement']*math.cos(math.radians(float(_p(r,'angle_degrees',0)))); return _resp(r,val,{'formula':'W=F*s*cos(theta)','unit':'J'})
        if op=='physics_hydrostatic_pressure':
          q=_nums(r,'density','depth'); return _resp(r,q['density']*float(_p(r,'gravity',9.80665))*q['depth'],{'formula':'p=rho*g*h','unit':'Pa'})
        if op=='physics_heat_energy':
          q=_nums(r,'mass','specific_heat','temperature_change'); return _resp(r,q['mass']*q['specific_heat']*q['temperature_change'],{'formula':'Q=m*c*delta_T','unit':'J'})
        if op=='chemistry_molar_mass':
          formula=str(_p(r,'formula','')).strip()
          if not formula: raise ValueError('Provide formula, e.g. H2O')
          counts=formula_counts(formula); mass=sum(ATOMIC_WEIGHTS[e]*c for e,c in counts.items())
          return _resp(r,{'molar_mass_g_mol':mass,'formula':formula},{'unit':'g/mol','element_counts':counts,'atomic_weights':'standard atomic weights for common elements; unsupported elements rejected'})
        if op=='chemistry_molarity':
          q=_nums(r,'moles','volume_liters');
          if q['moles']<0 or q['volume_liters']<=0: raise ValueError('moles must be non-negative and volume_liters positive')
          return _resp(r,q['moles']/q['volume_liters'],{'formula':'M=n/V','unit':'mol/L'})
        if op=='chemistry_dilution':
          q=_nums(r,'initial_concentration','initial_volume','final_volume');
          if q['initial_volume']<0 or q['final_volume']<=0: raise ValueError('initial_volume must be non-negative and final_volume positive')
          return _resp(r,q['initial_concentration']*q['initial_volume']/q['final_volume'],{'formula':'C1*V1=C2*V2','unit':'same concentration unit as C1'})
        if op=='chemistry_ideal_gas':
          q=_nums(r,'pressure','volume','temperature');
          if q['volume']<=0 or q['temperature']<=0: raise ValueError('volume and temperature in kelvin must be positive')
          R=float(_p(r,'gas_constant',0.08205736608096)); return _resp(r,q['pressure']*q['volume']/(R*q['temperature']),{'formula':'n=PV/(RT)','unit':'mol','units':'L, atm, K'})
        if op=='chemistry_ph':
          q=_nums(r,'concentration');
          if q['concentration']<=0: raise ValueError('concentration must be positive')
          return _resp(r,-math.log10(q['concentration']),{'formula':'pH=-log10([H+])','assumption':'strong acid approximation; concentration in mol/L'})
        if op=='chemistry_balance_equation':
          from app.inputs.notation import normalize_chemical_equation, NotationError
          try: lhs,rhs,_=normalize_chemical_equation(str(_p(r,'equation','')).replace('->','→'))
          except NotationError as e: raise ValueError(str(e)) from e
          species=lhs+rhs
          cs=[formula_counts(f) for f in species]; elements=sorted({e for d in cs for e in d})
          mat=sp.Matrix([[d.get(e,0)*(1 if j<len(lhs) else -1) for j,d in enumerate(cs)] for e in elements]); ns=mat.nullspace()
          if not ns: raise ValueError('No balancing solution found')
          if len(ns)>1: raise ValueError('Equation has more than one independent balance (it combines several reactions); balance each reaction separately')
          vec=ns[0]
          if any(v<=0 for v in vec): raise ValueError('Could not find positive coefficients for this equation')
          den=sp.ilcm(*[v.q for v in vec]); coeff=[int(v*den) for v in vec]; g=math.gcd(*coeff); coeff=[v//g for v in coeff]
          out=lambda ss,cc:' + '.join((str(c) if c!=1 else '')+s for s,c in zip(ss,cc))
          return _resp(r,{'balanced_equation':out(lhs,coeff[:len(lhs)])+' -> '+out(rhs,coeff[len(lhs):]),'coefficients':coeff},{'elements_balanced':elements,'method':'integer nullspace'})
        if op=='chemistry_stoichiometry':
          q=_nums(r,'given_moles','given_coefficient','target_coefficient');
          if q['given_moles']<0 or min(q['given_coefficient'],q['target_coefficient'])<=0: raise ValueError('moles must be non-negative and coefficients positive')
          return _resp(r,q['given_moles']*q['target_coefficient']/q['given_coefficient'],{'formula':'n_target=n_given*coefficient_target/coefficient_given','unit':'mol','assumption':'balanced equation and limiting reagent considered separately'})
        if op=='engineering_reynolds':
          q=_nums(r,'density','velocity','characteristic_length','dynamic_viscosity');
          if min(q['density'],q['characteristic_length'],q['dynamic_viscosity'])<=0: raise ValueError('density, length, and viscosity must be positive')
          val=q['density']*abs(q['velocity'])*q['characteristic_length']/q['dynamic_viscosity']; return _resp(r,val,{'formula':'Re=rho*v*L/mu','unit':'dimensionless','regime_hint':'thresholds depend on geometry/flow'})
        if op=='engineering_heat_transfer':
          q=_nums(r,'heat_transfer_coefficient','area','temperature_difference');
          if min(q['heat_transfer_coefficient'],q['area'])<0: raise ValueError('coefficient and area must be non-negative')
          return _resp(r,q['heat_transfer_coefficient']*q['area']*q['temperature_difference'],{'formula':'Q_dot=h*A*delta_T','unit':'W'})
        if op=='engineering_efficiency':
          q=_nums(r,'useful_output','total_input');
          if q['total_input']<=0 or q['useful_output']<0: raise ValueError('input must be positive and output non-negative')
          val=100*q['useful_output']/q['total_input']; return _resp(r,val,{'formula':'efficiency=output/input*100','unit':'%','physical_range_check':val<=100},val<=100+1e-9,'Efficiency above 100% flags possible input inconsistency')
        if op=='engineering_voltage_divider':
          q=_nums(r,'input_voltage','r1','r2');
          if min(q['r1'],q['r2'])<0 or q['r1']+q['r2']==0: raise ValueError('resistances must be non-negative and not both zero')
          return _resp(r,q['input_voltage']*q['r2']/(q['r1']+q['r2']),{'formula':'Vout=Vin*R2/(R1+R2)','unit':'V','assumption':'unloaded ideal divider'})
        if op=='engineering_bending_stress':
          q=_nums(r,'bending_moment','second_moment_area','distance_from_neutral_axis');
          if q['second_moment_area']<=0: raise ValueError('second_moment_area must be positive')
          return _resp(r,abs(q['bending_moment']*q['distance_from_neutral_axis']/q['second_moment_area']),{'formula':'sigma=M*y/I','unit':'Pa','assumption':'linear elastic beam; magnitude only'})
        if op=='engineering_flow_rate':
          q=_nums(r,'area','average_velocity');
          if q['area']<0: raise ValueError('area must be non-negative')
          return _resp(r,q['area']*q['average_velocity'],{'formula':'Q=A*v','unit':'m^3/s'})
        if op=='engineering_safety_factor':
          q=_nums(r,'failure_strength','working_stress');
          if min(q.values())<=0: raise ValueError('strength and working stress must be positive')
          return _resp(r,q['failure_strength']/q['working_stress'],{'formula':'FoS=strength/stress','unit':'dimensionless'})
        raise ValueError(f'Unsupported STEM operation: {op}')
      except (ValueError,TypeError,KeyError,ZeroDivisionError,OverflowError) as e:  # UnitError subclasses ValueError
        return SolverResponse(request_id=r.request_id,status='failed',solver=r.solver,error=str(e))


_NUM=r'(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)'
_UNIT=r'([A-Za-z°µμΩ][A-Za-z°µμΩ/^0-9²³⁻·*\-]*)'
_UNITP=r'[A-Za-z°µμΩ][A-Za-z°µμΩ/^0-9²³⁻·*\-]*(?:\s+per\s+[A-Za-z]+)?'

def _qty(num,unit):
    """Keep the unit the user wrote (case-sensitive) so the shared unit layer can convert it."""
    return f"{num} {unit}".strip() if unit else float(num)

def interpret_question(question: str) -> dict[str,Any]:
    """Conservative NL-to-solver mapping for a documented set of templates.

    Quantities keep their units (e.g. ``"10 g"``); the shared preflight converts them to the
    unit each solver expects, so wording like "mass 500 g" is handled correctly.
    """
    try:
      return _interpret(question)
    except (ValueError,TypeError):
      return _clarify()

def _clarify():
    return {'status':'needs_clarification','message':'I could not safely map this wording to a supported calculation. Include the quantity, values and units, or use a structured solver request.','supported_patterns':['unit conversion','force from mass and acceleration','Ohm law current','kinetic energy','molar mass of supported formulas','balancing simple chemical equations','Reynolds number','explicit algebraic equations']}

def _interpret(question: str) -> dict[str,Any]:
    from app.inputs.notation import clean_numeric_text
    q=question.strip().replace('→','->'); q=clean_numeric_text(q) if any(c in q for c in '−×⁻') else q
    m=re.search(_NUM+r'\s*('+_UNITP+r')\s+(?i:to|into)\s+('+_UNITP+')',q)
    if m: return {'solver':'unit_convert','extra_params':{'value':float(m.group(1)),'from_unit':m.group(2).strip(),'to_unit':m.group(3).strip()},'confidence':'template'}
    m=re.search(r'(?:force|newton(?:.?s)? second law).*?mass\s*(?:of\s*)?'+_NUM+r'\s*'+_UNIT+r'?.*?acceleration\s*(?:of\s*)?'+_NUM+r'\s*'+_UNIT+'?',q,re.I|re.S)
    if m: return {'solver':'physics_force','extra_params':{'mass':_qty(m.group(1),m.group(2)),'acceleration':_qty(m.group(3),m.group(4))},'confidence':'template'}
    m=re.search(r'(?:ohm.?s law|calculate current).*?(?:voltage|potential difference)\s*(?:of\s*)?'+_NUM+r'\s*'+_UNIT+r'?.*?resistance\s*(?:of\s*)?'+_NUM+r'\s*'+_UNIT+'?',q,re.I|re.S)
    if m: return {'solver':'physics_ohms_law','extra_params':{'voltage':_qty(m.group(1),m.group(2)),'resistance':_qty(m.group(3),m.group(4))},'confidence':'template'}
    m=re.search(r'(?:kinetic energy).*?mass\s*(?:of\s*)?'+_NUM+r'\s*'+_UNIT+r'?.*?(?:velocity|speed)\s*(?:of\s*)?'+_NUM+r'\s*'+_UNIT+'?',q,re.I|re.S)
    if m: return {'solver':'physics_kinetic_energy','extra_params':{'mass':_qty(m.group(1),m.group(2)),'velocity':_qty(m.group(3),m.group(4))},'confidence':'template'}
    m=re.search(r'(?:molar mass|molecular mass).*?\bof\s+([A-Z][A-Za-z0-9()\u2080-\u2089·.]*)',q,re.I)
    if m: return {'solver':'chemistry_molar_mass','extra_params':{'formula':m.group(1)},'confidence':'template'}
    m=re.search(r'(?:balance|balancing)\s+(?:the\s+)?chemical equation\s*[:\-]?\s*(.+)',q,re.I)
    if m: return {'solver':'chemistry_balance_equation','extra_params':{'equation':m.group(1).strip()},'confidence':'template'}
    m=re.search(r'(?:calculate|find|what is)\s+(?:the\s+)?(?:reynolds number).*?density\s*(?:of\s*)?'+_NUM+r'\s*'+_UNIT+r'?.*?velocity\s*(?:of\s*)?'+_NUM+r'\s*'+_UNIT+r'?.*?(?:length|diameter)\s*(?:of\s*)?'+_NUM+r'\s*'+_UNIT+r'?.*?viscosity\s*(?:of\s*)?'+_NUM+r'\s*'+_UNIT+'?',q,re.I|re.S)
    if m: return {'solver':'engineering_reynolds','extra_params':{'density':_qty(m.group(1),m.group(2)),'velocity':_qty(m.group(3),m.group(4)),'characteristic_length':_qty(m.group(5),m.group(6)),'dynamic_viscosity':_qty(m.group(7),m.group(8))},'confidence':'template'}
    m=re.search(r'(?:solve|find the roots? of|solve the equation)\s+(.+)',q,re.I)
    if m and any(c in m.group(1) for c in '=^*+-²'): return {'solver':'solve_equation','expression':m.group(1).strip(),'variable':'x','confidence':'template'}
    return _clarify()
