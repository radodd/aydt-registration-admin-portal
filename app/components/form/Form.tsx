// import React from "react";
// import { FieldValues, FormProps, FormProvider, useForm } from "react-hook-form";

// const FormContext = React.createContext<ReturnType<typeof useForm> | null>(
//   null
// );

// function Form<T extends FieldValues>({
//   onSubmit,
//   children,
//   ...methods
// }: FormProps<T>) {
//   return (
//     <FormProvider {...methods}>
//       <FormContext.Provider value={methods}>
//         <form onSubmit={methods.handleSubmit(onSubmit)} className="space-y-5">
//           {children}
//         </form>
//       </FormContext.Provider>
//     </FormProvider>
//   );
// }
// export default Form;
