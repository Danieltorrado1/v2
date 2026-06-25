import { useState } from 'react';
import { Calculator } from 'lucide-react';
import SalarioConfigTab from '../../SalarioConfigTab';
import PersonalConfigTab from '../../PersonalConfigTab';

type CalcTab = 'salario' | 'personal';

export function CalculadorasSection() {
  const [calcTab, setCalcTab] = useState<CalcTab>('salario');

  return (
    <div>
      <div className="cg-tab-header">
        <div>
          <h4 className="cg-tab-title"><Calculator size={15} /> Configuración de Calculadoras</h4>
          <p className="cg-tab-subtitle">Parámetros para las calculadoras de salario y personal</p>
        </div>
      </div>

      <div className="adm-calc-tabs">
        <button className={`adm-calc-tab ${calcTab === 'salario' ? 'active' : ''}`} onClick={() => setCalcTab('salario')}>
          <Calculator size={14} /> Calculadora de Salario
        </button>
        <button className={`adm-calc-tab ${calcTab === 'personal' ? 'active' : ''}`} onClick={() => setCalcTab('personal')}>
          <Calculator size={14} /> Calculadora de Personal
        </button>
      </div>

      {calcTab === 'salario' && <SalarioConfigTab />}
      {calcTab === 'personal' && <PersonalConfigTab />}
    </div>
  );
}
