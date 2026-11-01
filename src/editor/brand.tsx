import React, { createContext, useContext } from 'react';
export type Brand={companyName?:string;companyLogoUrl?:string;[key:string]:unknown};
export const BrandContext=createContext<Brand>({});
export const BrandProvider=BrandContext.Provider;
export const useBrand=()=>useContext(BrandContext);
